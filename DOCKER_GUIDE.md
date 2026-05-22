# Guia de Uso com Docker 🐳

Este guia explica como rodar o sistema GreenStore no seu computador usando Docker, a forma mais simples e rápida.

## 1. Pré-requisitos
*   **Docker Desktop** instalado. Baixe em: [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)

## 2. Como Iniciar o Sistema

1.  Abra o terminal na pasta do projeto.
2.  Execute o comando:
    ```bash
    docker-compose up --build
    ```
3.  Aguarde a finalização (o Docker vai baixar o Postgres, Redis e configurar tudo sozinho).
4.  Quando aparecer a mensagem `GreenStore API rodando na porta 3000`, o sistema está pronto!

## 3. Acesso
*   **URL:** [http://localhost:3000](http://localhost:3000)
*   **E-mail Admin:** `admin@hortifruti.com`
*   **Senha Admin:** `admin123456`

## 4. Comandos Úteis
*   **Parar o sistema:** `Ctrl + C` no terminal ou `docker-compose down`.
*   **Rodar em segundo plano:** `docker-compose up -d`.
*   **Ver logs:** `docker-compose logs -f`.

---
**Nota:** As configurações de banco de dados e segredos já estão pré-configuradas no arquivo `docker-compose.yml` para facilitar seu primeiro teste. Para produção, lembre-se de alterar o `JWT_SECRET`.
