# 🚀 Guia Definitivo: Do Zero ao Sistema Pronto (Windows/Mac/Linux)

Este guia foi feito para quem não tem **nada** instalado no computador e quer rodar o sistema **GreenStore Hortifruti** usando Docker. Siga cada etapa na ordem.

---

## 1️⃣ Etapa: Instalar as Ferramentas Básicas

Você precisa de duas ferramentas essenciais no seu computador:

### A. Instalar o Git (Para baixar o código)
1.  Acesse: [git-scm.com/downloads](https://git-scm.com/downloads)
2.  Baixe a versão para o seu sistema (Windows, macOS ou Linux).
3.  Instale seguindo as instruções padrão ("Next", "Next", "Finish").

### B. Instalar o Docker Desktop (O "Motor" do sistema)
1.  Acesse: [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)
2.  Clique em **Download for Windows** (ou Mac).
3.  Após baixar, execute o instalador. 
    *   *Nota para Windows:* Se ele pedir para instalar o "WSL 2", aceite e siga as instruções na tela.
4.  **Reinicie o computador** após a instalação do Docker.
5.  Abra o Docker Desktop e aceite os termos de uso. Espere o ícone da baleia ficar verde ou estável.

---

## 2️⃣ Etapa: Baixar o Código do Sistema

Agora que você tem as ferramentas, vamos baixar o projeto que eu preparei para você.

1.  Crie uma pasta no seu computador onde quer guardar o projeto (ex: na Área de Trabalho).
2.  Abra o **Terminal** (no Windows, procure por `PowerShell` ou `CMD`).
3.  Digite o comando abaixo para entrar na pasta que você criou (exemplo para Área de Trabalho):
    ```bash
    cd Desktop
    ```
4.  Agora, digite o comando para baixar o código:
    ```bash
    git clone https://github.com/luizgustavo159/hortifruti-docker.git
    ```
5.  Entre na pasta do projeto:
    ```bash
    cd hortifruti-docker
    ```

---

## 3️⃣ Etapa: Ligar o Sistema (O momento mágico!)

Com o Docker Desktop aberto e rodando, volte ao terminal dentro da pasta `hortifruti-docker` e digite:

```bash
docker-compose up --build
```

### O que vai acontecer agora?
*   O Docker vai baixar o **PostgreSQL** (Banco de Dados).
*   O Docker vai baixar o **Redis** (Cache).
*   O Docker vai compilar todo o sistema (Frontend e Backend).
*   *Isso pode demorar de 2 a 5 minutos na primeira vez, dependendo da sua internet.*

Quando você vir uma mensagem escrita: **`GreenStore API rodando na porta 3000`**, parabéns! O sistema está no ar.

---

## 4️⃣ Etapa: Acessar e Usar

1.  Abra o seu navegador (Chrome, Edge, etc).
2.  Digite o endereço: **[http://localhost:3000](http://localhost:3000)**
3.  Use os dados abaixo para entrar:
    *   **E-mail:** `admin@greenstore.com`
    *   **Senha:** `admin123456`

---

## 💡 Dicas Importantes

*   **Para parar o sistema:** Volte ao terminal e aperte `Ctrl + C`.
*   **Para ligar de novo futuramente:** Basta abrir o terminal na pasta e rodar `docker-compose up` (sem o --build, é mais rápido).
*   **Erro de Porta Ocupada:** Se o Docker disser que a porta 3000 já está em uso, verifique se você não tem outro programa de programação aberto.

---
*Guia gerado pelo Manus AI para Luiz Gustavo. 🌿*
