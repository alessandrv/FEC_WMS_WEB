"""Exercise comparison SQL and reset confirmation without connecting to the live database."""
import ast
import sqlite3
import unittest
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock


class InventoryComparisonTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        for table in ('wms_items', 'wms_inventario'):
            self.db.execute(f'CREATE TABLE {table} (id_art TEXT, id_mov TEXT, area TEXT, scaffale TEXT, colonna TEXT, piano TEXT, qta INTEGER)')
        self.db.execute('CREATE TABLE mag_giacenza (cod_articolo TEXT, rif_lotto TEXT, cod_magazzino TEXT, giacenza_gest NUMERIC)')
        source = ast.parse(Path(__file__).with_name('backend.py').read_text(encoding='utf-8'))
        functions = [n for n in source.body if isinstance(n, ast.FunctionDef)
                     and n.name in ('get_inventario_differenze', 'reset_inventario', 'get_inventario_differenze_skyline', 'normalizza_movimento', '_normalize_value')]
        for node in functions:
            node.decorator_list = []
        self.env = {
            'jsonify': lambda data: data, 'datetime': datetime,
            'connect_to_db': self.connect, 'pyodbc': SimpleNamespace(Error=sqlite3.Error),
            'Decimal': Decimal, 'MAGAZZINO_PRINCIPALE': 'BAS01',
            'request': SimpleNamespace(args={}),
            '_DOCUMENTO_RE': __import__('re').compile(r'(?:^|[,\s])(\d{4})\s*[,/-]\s*([A-Z]{1,3})\s*[,/-]\s*(\d+)\s*$'),
        }
        exec(compile(ast.Module(body=functions, type_ignores=[]), 'inventory_routes', 'exec'), self.env)

    def connect(self):
        # Keep the fixture available for assertions after route cleanup.
        return SimpleNamespace(cursor=self.db.cursor, close=lambda: None)

    def add(self, table, article, movement, quantity):
        self.db.execute(f'INSERT INTO {table} VALUES (?, ?, ?, ?, ?, ?, ?)',
                        (article, movement, 'A', 'A', '01', '1', quantity))

    def tearDown(self):
        self.db.close()

    def test_missing_extra_mismatch_and_matching_counts(self):
        self.add('wms_items', 'missing', '880', 5)
        self.add('wms_inventario', 'extra', '2026/CA/63', 2)
        self.add('wms_items', 'mismatch', None, 8)
        self.add('wms_inventario', 'mismatch', None, 3)
        self.add('wms_inventario', 'mismatch', None, 2)
        self.add('wms_items', 'matching', '880', 4)
        self.add('wms_items', 'matching', '880', 6)
        self.add('wms_inventario', 'matching', '880', 10)
        rows = {r['codice_articolo']: r for r in self.env['get_inventario_differenze']()['rows']}
        self.assertEqual(set(rows), {'missing', 'extra', 'mismatch'})
        self.assertEqual(rows['missing']['tipo'], 'Mancante in inventario')
        self.assertEqual(rows['missing']['differenza'], -5)
        self.assertEqual(rows['extra']['tipo'], 'Assente nel WMS')
        self.assertEqual(rows['mismatch']['quantita_inventario'], 5)
        self.assertEqual(rows['mismatch']['differenza'], -3)
        self.assertEqual(rows['missing']['locazione'], 'A-A-01-1')

    def test_different_movements_are_not_merged(self):
        self.add('wms_items', 'abc', '880', 5)
        self.add('wms_inventario', 'abc', '2026/CA/63', 5)
        rows = self.env['get_inventario_differenze']()['rows']
        self.assertEqual(len(rows), 2)

    def test_reset_rejects_missing_or_inexact_confirmation_before_db_access(self):
        def forbidden():
            self.fail('Reset must not access database before exact confirmation')
        self.env['connect_to_db'] = forbidden
        for confirmation in (None, '', 'Confermo', 'confermo ', 'yes'):
            self.env['request'] = SimpleNamespace(get_json=lambda **kwargs: {'confirmation': confirmation})
            self.assertEqual(self.env['reset_inventario']()[1], 400)

    def test_confirmed_reset_only_deletes_inventory_and_commits(self):
        cursor = Mock()
        cursor.fetchone.return_value = (12,)
        connection = Mock()
        connection.cursor.return_value = cursor
        self.env['connect_to_db'] = lambda: connection
        self.env['request'] = SimpleNamespace(get_json=lambda **kwargs: {'confirmation': 'confermo'}, remote_addr='127.0.0.1')
        self.env['log_operation'] = Mock()
        self.assertEqual(self.env['reset_inventario'](), {'success': True, 'deleted': 12})
        self.assertEqual([c.args[0] for c in cursor.execute.call_args_list], [
            'LOCK TABLE wms_inventario IN EXCLUSIVE MODE NOWAIT',
            'SELECT COUNT(*) FROM wms_inventario', 'DELETE FROM wms_inventario',
        ])
        connection.commit.assert_called_once()
        self.env['log_operation'].assert_called_once()

    def test_skyline_totals_ignore_location_lot_and_other_warehouses(self):
        self.add('wms_inventario', 'abc', '880', 3)
        self.add('wms_inventario', 'abc', '2026/CA/63', 2)
        self.db.executemany('INSERT INTO mag_giacenza VALUES (?, ?, ?, ?)', [
            ('abc ', '880', 'BAS01 ', 4), ('abc', '2026/CA/63', 'BAS01', 1),
            ('abc', None, 'OTHER', 99), ('sky-only', None, 'BAS01', 1.5),
        ])
        self.add('wms_inventario', 'inv-only', None, 7)
        rows = self.env['get_inventario_differenze_skyline']()['rows']
        self.assertEqual({r['codice_articolo'] for r in rows}, {'sky-only', 'inv-only'})
        self.assertEqual(next(r for r in rows if r['codice_articolo'] == 'sky-only')['differenza'], -1.5)

    def test_skyline_totals_include_all_lots(self):
        self.add('wms_inventario', 'abc', '2026/CA/63', 5)
        self.db.execute("INSERT INTO mag_giacenza VALUES ('abc', '2026/CA/063 ', 'BAS01', 5)")
        self.db.execute("INSERT INTO mag_giacenza VALUES ('abc', NULL, 'BAS01', 2)")
        rows = self.env['get_inventario_differenze_skyline']()['rows']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['quantita_skyline'], 7)
        self.assertEqual(rows[0]['differenza'], -2)


if __name__ == '__main__':
    unittest.main()
