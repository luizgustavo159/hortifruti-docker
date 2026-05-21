const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('/home/ubuntu/hortifruti/db.sqlite');

const ACTION_MAP = {
    'migration_error': 'Erro de Estrutura do Banco',
    'sale_attempt_failed_cash_closed': 'Venda Bloqueada (Caixa Fechado)',
    'client_error': 'Aviso de Uso do Sistema',
    'system_error': 'Erro Interno do Servidor',
    'sale_created': 'Venda Realizada',
    'cash_session_opened': 'Abertura de Caixa',
    'cash_session_closed': 'Fechamento de Caixa',
    'approval_granted': 'Aprovação Concedida',
    'stock_adjust': 'Ajuste de Estoque',
    'stock_loss': 'Perda de Estoque',
    'product_created': 'Produto Cadastrado',
    'discount_created': 'Desconto Criado'
};

db.all("SELECT id, action, details FROM audit_logs", [], (err, rows) => {
    if (err) {
        console.error(err);
        return;
    }

    rows.forEach(row => {
        let newAction = ACTION_MAP[row.action] || row.action;
        let details = {};
        try {
            details = JSON.parse(row.details);
        } catch (e) {
            details = { info: row.details };
        }

        // Traduzir detalhes técnicos para humano
        let newDetails = {};
        
        if (row.action === 'client_error' || row.action === 'system_error') {
            newDetails.mensagem = `O sistema registrou um problema ao tentar acessar ${details.path || details.caminho_acessado || 'uma página'}`;
            newDetails.detalhe = `Código de erro: ${details.status || details.codigo_status || 'Desconhecido'}`;
        } else if (row.action === 'sale_attempt_failed_cash_closed') {
            newDetails.mensagem = "Um operador tentou realizar uma venda, mas o caixa estava fechado.";
            newDetails.orientação = "O caixa deve ser aberto antes de iniciar as vendas.";
        } else if (row.action === 'migration_error') {
            newDetails.mensagem = "Houve uma falha ao atualizar os arquivos do sistema.";
            newDetails.erro = details.error || details.erro_tecnico || "Erro desconhecido";
        } else {
            // Para outros, apenas garantir que as chaves fiquem bonitas
            for (let key in details) {
                let newKey = key
                    .replace('session_id', 'ID da Sessão')
                    .replace('opening_amount', 'Valor de Abertura')
                    .replace('reason', 'Motivo')
                    .replace('items_count', 'Qtd de Itens')
                    .replace('payment_method', 'Forma de Pagamento')
                    .replace('total', 'Valor Total')
                    .replace('final_total', 'Valor Final');
                newDetails[newKey] = details[key];
            }
        }

        db.run("UPDATE audit_logs SET action = ?, details = ? WHERE id = ?", [
            newAction,
            JSON.stringify(newDetails),
            row.id
        ]);
    });
    console.log("Conversão de logs concluída.");
});
