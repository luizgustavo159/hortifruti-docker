const { app } = require("./src/app");
const config = require("./config");

const { PORT } = config;

const server = app.listen(PORT, () => {
  console.log(`GreenStore API rodando na porta ${PORT}`);
});

module.exports = { app, server };
