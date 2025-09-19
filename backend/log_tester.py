import os
from logging.handlers import RotatingFileHandler
import logging
import time

base = os.path.dirname(__file__)
req_log = os.path.join(base, 'request_debug.log')
backend_log = os.path.join(base, 'backend.log')

# write simple file
with open(req_log, 'a', encoding='utf-8') as f:
    f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} LOG_TEST request_debug OK\n")

# setup rotating handler
logger = logging.getLogger('log_tester')
logger.setLevel(logging.DEBUG)
handler = RotatingFileHandler(backend_log, maxBytes=1024*1024, backupCount=1)
handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
if not logger.handlers:
    logger.addHandler(handler)

logger.info('LOG_TEST backend logger OK')

print('WROTE test lines to', req_log, 'and', backend_log)
