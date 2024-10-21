// index.js
const express = require('express');
const { queryDatabase } = require('./db');
const app = express();
const port = 3000;

app.use(express.json());

app.get('/api/fornitori', async (req, res) => {
  const query = `
    SELECT o.oft_tipo, o.oft_code, o.oft_stat, o.oft_data, o.oft_cofo, a.des_clifor, o.oft_inarrivo
    FROM ofordit o
    LEFT JOIN agclifor a ON o.oft_cofo = a.cod_clifor
    WHERE o.oft_stat = 'A'
    ORDER BY o.oft_inarrivo DESC, o.oft_data DESC
  `;

  try {
    const data = await queryDatabase(query);
    res.json(data);
  } catch (error) {
    res.status(500).send('Error retrieving data');
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
