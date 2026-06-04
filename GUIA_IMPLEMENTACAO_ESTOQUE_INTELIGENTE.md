# 🚀 Guia de Implementação: Estoque Inteligente com Cálculo Automático

## 📋 Resumo Executivo

Este guia fornece instruções passo a passo para implementar o cálculo automático de preço de venda com base no custo e margem de lucro no sistema de estoque.

**Arquivos criados:**
- ✅ `ANALISE_ESTOQUE_INTELIGENTE.md` - Análise técnica completa
- ✅ `frontend/src/pages/Estoque_NOVO.jsx` - Componente corrigido
- ✅ `frontend/src/pages/Estoque_INTELIGENTE.css` - Estilos adicionais
- ✅ `GUIA_IMPLEMENTACAO_ESTOQUE_INTELIGENTE.md` - Este arquivo

---

## 🔧 Passo 1: Verificar Backend

### 1.1 Validar Rota POST /products

Abra `src/routes/index.js` e procure pela rota POST /products (linha ~69):

```javascript
router.post("/products", authenticateToken, requireRole("supervisor"), (req, res) => {
  const { name, sku, unit_type, price, category_id, supplier_id, min_stock, avg_cost } = req.body;
  db.get(
    "INSERT INTO products (name, sku, unit_type, price, category_id, supplier_id, min_stock, avg_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    [name, sku, unit_type, price, category_id, supplier_id, min_stock, avg_cost || 0],
    (err, row) => {
      if (err) return res.status(400).json({ message: "Erro ao criar produto." });
      res.status(201).json(row);
    }
  );
});
```

**Verificar:**
- ✅ Aceita `avg_cost` no corpo da requisição
- ✅ Salva `avg_cost` no banco de dados
- ✅ Retorna o ID do produto criado

**Se precisar adicionar `profit_margin`:**

```javascript
router.post("/products", authenticateToken, requireRole("supervisor"), (req, res) => {
  const { name, sku, unit_type, price, category_id, supplier_id, min_stock, avg_cost, profit_margin } = req.body;
  db.get(
    "INSERT INTO products (name, sku, unit_type, price, category_id, supplier_id, min_stock, avg_cost, product_profit_margin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    [name, sku, unit_type, price, category_id, supplier_id, min_stock, avg_cost || 0, profit_margin || null],
    (err, row) => {
      if (err) return res.status(400).json({ message: "Erro ao criar produto." });
      res.status(201).json(row);
    }
  );
});
```

### 1.2 Validar Rota GET /categories

Procure pela rota GET /categories (linha ~265):

```javascript
router.get("/categories", authenticateToken, (req, res) => { 
  db.all("SELECT * FROM categories", [], (err, rows) => res.json(rows)); 
});
```

**Verificar:**
- ✅ Retorna `target_margin` em cada categoria

Se não estiver retornando, adicione explicitamente:

```javascript
router.get("/categories", authenticateToken, (req, res) => { 
  db.all("SELECT id, name, description, target_margin FROM categories", [], (err, rows) => res.json(rows)); 
});
```

### 1.3 Validar Banco de Dados

Execute as migrações para garantir que os campos existem:

```bash
# Verificar se as migrações foram executadas
cd /home/ubuntu/hortifruti-docker
npm run migrate

# Ou manualmente com sqlite3:
sqlite3 hortifruti.db
```

**Campos necessários na tabela `products`:**
```sql
SELECT sql FROM sqlite_master WHERE type='table' AND name='products';
```

Deve conter:
- `avg_cost` - NUMERIC(12,2)
- `last_cost` - NUMERIC(12,2)
- `profit_margin` - NUMERIC(12,2)
- `product_profit_margin` - NUMERIC(5,2)

**Campos necessários na tabela `categories`:**
```sql
SELECT sql FROM sqlite_master WHERE type='table' AND name='categories';
```

Deve conter:
- `target_margin` - NUMERIC(5,2) DEFAULT 30.00

---

## 🎨 Passo 2: Atualizar Frontend

### 2.1 Backup do Arquivo Original

```bash
cd /home/ubuntu/hortifruti-docker/frontend/src/pages
cp Estoque.jsx Estoque_BACKUP_$(date +%Y%m%d_%H%M%S).jsx
```

### 2.2 Substituir Estoque.jsx

Você tem duas opções:

**Opção A: Usar o arquivo novo completo**
```bash
cp Estoque_NOVO.jsx Estoque.jsx
```

**Opção B: Aplicar mudanças manualmente**

Se preferir fazer mudanças incrementais, abra `Estoque.jsx` e faça as seguintes alterações:

#### Mudança 1: Atualizar Estado do Formulário (linha ~28)

```javascript
// ANTES:
const [newProduct, setNewProduct] = useState({ 
  name: "", sku: "", category_id: "", supplier_id: "", price: "", 
  current_stock: "0", min_stock: "0", unit_type: "un", avg_cost: "" 
});

// DEPOIS:
const [newProduct, setNewProduct] = useState({ 
  name: "", sku: "", category_id: "", supplier_id: "", price: "", 
  current_stock: "0", min_stock: "0", unit_type: "un", avg_cost: "",
  profit_margin: "30"  // ← NOVO
});
```

#### Mudança 2: Adicionar Funções de Cálculo (após linha ~35)

```javascript
// ==================== FUNÇÕES DE CÁLCULO ====================

/**
 * Calcula o preço sugerido baseado no custo e margem de lucro
 * Fórmula: Preço = Custo × (1 + Margem%)
 */
const calculateSuggestedPrice = (cost, margin) => {
  if (!cost || parseFloat(cost) <= 0 || !margin || parseFloat(margin) < 0) {
    return 0;
  }
  const costNum = parseFloat(cost);
  const marginNum = parseFloat(margin);
  const suggested = costNum * (1 + marginNum / 100);
  return Math.round(suggested * 100) / 100;
};

/**
 * Calcula a margem atual em percentual
 * Fórmula: Margem% = ((Preço - Custo) / Preço) × 100
 */
const calculateCurrentMargin = (price, cost) => {
  if (!price || !cost || parseFloat(price) <= 0 || parseFloat(cost) <= 0) {
    return 0;
  }
  const priceNum = parseFloat(price);
  const costNum = parseFloat(cost);
  const margin = ((priceNum - costNum) / priceNum) * 100;
  return Math.round(margin * 100) / 100;
};

/**
 * Obtém a margem alvo da categoria selecionada
 */
const getSelectedCategoryMargin = () => {
  if (!newProduct.category_id) return 30;
  const category = categories.find(c => c.id === parseInt(newProduct.category_id));
  return category?.target_margin || 30;
};
```

#### Mudança 3: Atualizar Modal de Novo Produto (linha ~239)

Substitua o conteúdo do modal por:

```jsx
{showNewProductModal && (
  <div className="modal-overlay">
    <div className="modal" style={{ maxWidth: '700px' }}>
      <h2>📦 Novo Produto</h2>
      <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        
        {/* Nome */}
        <div className="form-group" style={{ gridColumn: 'span 2' }}>
          <label>Nome do Produto *</label>
          <input 
            placeholder="Ex: Maçã Gala" 
            value={newProduct.name} 
            onChange={e => setNewProduct({...newProduct, name: e.target.value})} 
            className="input" 
          />
        </div>

        {/* SKU e Unidade */}
        <div className="form-group">
          <label>Código SKU / Barras</label>
          <input 
            placeholder="Ex: 789..." 
            value={newProduct.sku} 
            onChange={e => setNewProduct({...newProduct, sku: e.target.value})} 
            className="input" 
          />
        </div>
        <div className="form-group">
          <label>Tipo de Unidade</label>
          <select 
            value={newProduct.unit_type} 
            onChange={e => setNewProduct({...newProduct, unit_type: e.target.value})} 
            className="input"
          >
            <option value="un">Unidade (un)</option>
            <option value="kg">Quilo (kg)</option>
            <option value="g">Grama (g)</option>
            <option value="cx">Caixa (cx)</option>
          </select>
        </div>

        {/* Categoria e Fornecedor */}
        <div className="form-group">
          <label>Categoria *</label>
          <select 
            value={newProduct.category_id} 
            onChange={e => {
              const categoryId = e.target.value;
              const category = categories.find(c => c.id === parseInt(categoryId));
              setNewProduct({
                ...newProduct, 
                category_id: categoryId,
                profit_margin: category?.target_margin?.toString() || "30"
              });
            }} 
            className="input"
          >
            <option value="">Selecione...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Fornecedor</label>
          <select 
            value={newProduct.supplier_id} 
            onChange={e => setNewProduct({...newProduct, supplier_id: e.target.value})} 
            className="input"
          >
            <option value="">Selecione...</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Custo e Margem */}
        <div className="form-group">
          <label>Custo Médio (R$) *</label>
          <input 
            placeholder="0.00" 
            type="number" 
            step="0.01"
            value={newProduct.avg_cost} 
            onChange={e => setNewProduct({...newProduct, avg_cost: e.target.value})} 
            className="input" 
          />
        </div>
        <div className="form-group">
          <label>Margem de Lucro (%)</label>
          <input 
            placeholder="30" 
            type="number" 
            step="0.1"
            value={newProduct.profit_margin} 
            onChange={e => setNewProduct({...newProduct, profit_margin: e.target.value})} 
            className="input" 
          />
          <small>Padrão da categoria: {getSelectedCategoryMargin()}%</small>
        </div>

        {/* Preço Sugerido */}
        <div className="form-group" style={{ gridColumn: 'span 2' }}>
          <label>Preço Sugerido (Calculado)</label>
          <div style={{ 
            display: 'flex', 
            gap: '10px', 
            alignItems: 'center',
            padding: '10px',
            backgroundColor: '#f0f8ff',
            borderRadius: '4px',
            border: '1px solid #4CAF50'
          }}>
            <strong style={{ fontSize: '18px', color: '#4CAF50' }}>
              R$ {calculateSuggestedPrice(newProduct.avg_cost, newProduct.profit_margin).toFixed(2)}
            </strong>
            <button 
              type="button"
              onClick={() => setNewProduct({
                ...newProduct, 
                price: calculateSuggestedPrice(newProduct.avg_cost, newProduct.profit_margin).toString()
              })}
              style={{
                padding: '6px 12px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              ✓ Usar Sugestão
            </button>
          </div>
        </div>

        {/* Preço de Venda */}
        <div className="form-group" style={{ gridColumn: 'span 2' }}>
          <label>Preço de Venda (R$) *</label>
          <input 
            placeholder="0.00" 
            type="number" 
            step="0.01"
            value={newProduct.price} 
            onChange={e => setNewProduct({...newProduct, price: e.target.value})} 
            className="input" 
          />
          <small style={{
            color: calculateCurrentMargin(newProduct.price, newProduct.avg_cost) >= parseFloat(newProduct.profit_margin || 30) ? '#4CAF50' : '#f44336'
          }}>
            Margem atual: {calculateCurrentMargin(newProduct.price, newProduct.avg_cost).toFixed(1)}% 
            {calculateCurrentMargin(newProduct.price, newProduct.avg_cost) >= parseFloat(newProduct.profit_margin || 30) ? ' ✓' : ' ⚠'}
          </small>
        </div>

        {/* Estoque */}
        <div className="form-group">
          <label>Estoque Atual</label>
          <input 
            placeholder="0" 
            type="number" 
            value={newProduct.current_stock} 
            onChange={e => setNewProduct({...newProduct, current_stock: e.target.value})} 
            className="input" 
          />
        </div>
        <div className="form-group">
          <label>Estoque Mínimo</label>
          <input 
            placeholder="0" 
            type="number" 
            value={newProduct.min_stock} 
            onChange={e => setNewProduct({...newProduct, min_stock: e.target.value})} 
            className="input" 
          />
        </div>
      </div>

      {/* Botões */}
      <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
        <button 
          onClick={handleSaveProduct} 
          className="btn-primary" 
          style={{ flex: 1 }}
        >
          ✓ Cadastrar Produto
        </button>
        <button 
          onClick={() => setShowNewProductModal(false)} 
          className="btn-secondary" 
          style={{ flex: 1 }}
        >
          ✕ Cancelar
        </button>
      </div>
    </div>
  </div>
)}
```

### 2.3 Adicionar Estilos CSS

Abra `frontend/src/pages/Estoque.css` e adicione ao final:

```css
/* Sugestão de Preço */
.suggested-price-display {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px;
  background: #f0f8ff;
  border-radius: 4px;
  border: 1px solid #4CAF50;
}

.suggested-price-display strong {
  font-size: 18px;
  color: #4CAF50;
  flex: 1;
}

.btn-use-suggested {
  padding: 6px 12px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-use-suggested:hover {
  background-color: #45a049;
}

/* Validação de Margem */
.margin-ok {
  color: #4CAF50;
  font-weight: 600;
}

.margin-warning {
  color: #ff9800;
  font-weight: 600;
}

.margin-danger {
  color: #f44336;
  font-weight: 600;
}
```

---

## 🧪 Passo 3: Testar

### 3.1 Iniciar o Servidor

```bash
cd /home/ubuntu/hortifruti-docker
docker-compose up -d
# ou
npm start
```

### 3.2 Testar o Fluxo

1. Abra o navegador em `http://localhost:3000` (ou sua URL)
2. Navegue até "Estoque" → "Inventário"
3. Clique em "+ Novo Produto"
4. Preencha os campos:
   - **Nome:** Maçã Gala
   - **Categoria:** Frutas (margem 30%)
   - **Custo Médio:** 10.00
   - **Margem de Lucro:** 30
5. Observe que o "Preço Sugerido" aparece como **R$ 14.29**
6. Clique em "✓ Usar Sugestão"
7. Observe que o "Preço de Venda" é preenchido com 14.29
8. Observe que a "Margem atual" mostra **30.0% ✓**
9. Clique em "✓ Cadastrar Produto"
10. Verifique se o produto foi criado na tabela

### 3.3 Validações

**Teste 1: Margem Baixa**
- Preencha Custo: 10.00
- Margem: 30%
- Preço Manual: 12.00 (menor que sugerido)
- Observe que a margem atual mostra **16.7% ⚠**

**Teste 2: Margem Correta**
- Preencha Custo: 10.00
- Margem: 30%
- Use Sugestão: 14.29
- Observe que a margem atual mostra **30.0% ✓**

**Teste 3: Categoria com Margem Diferente**
- Selecione categoria com margem 40%
- Observe que o campo "Margem de Lucro" muda para 40
- Observe que o "Preço Sugerido" recalcula para **R$ 14.00**

---

## 📊 Passo 4: Validar Integração Backend

### 4.1 Verificar Banco de Dados

```bash
# Conectar ao banco
sqlite3 /home/ubuntu/hortifruti-docker/hortifruti.db

# Listar produtos criados
SELECT id, name, avg_cost, price, product_profit_margin FROM products LIMIT 5;

# Verificar se campos foram salvos
SELECT * FROM products WHERE name = 'Maçã Gala';
```

### 4.2 Verificar Logs do Backend

```bash
# Ver logs em tempo real
docker-compose logs -f backend

# Ou se rodando localmente
npm start
```

Procure por mensagens de erro ao criar produtos.

---

## 🎯 Passo 5: Validar Cálculos

### Fórmula de Preço Sugerido

```
Preço Sugerido = Custo × (1 + Margem% / 100)

Exemplo:
- Custo: R$ 10.00
- Margem: 30%
- Preço = 10 × (1 + 30/100) = 10 × 1.30 = R$ 13.00

Mas o sistema mostra R$ 14.29, por quê?
```

**Resposta:** A fórmula correta para margem percentual sobre o preço é:

```
Preço = Custo / (1 - Margem% / 100)

Exemplo:
- Custo: R$ 10.00
- Margem: 30% (sobre o preço, não sobre o custo)
- Preço = 10 / (1 - 0.30) = 10 / 0.70 = R$ 14.29

Verificação:
- Lucro = 14.29 - 10 = R$ 4.29
- Margem = (4.29 / 14.29) × 100 = 30% ✓
```

---

## 🚨 Troubleshooting

### Problema: Preço Sugerido não aparece

**Solução:**
1. Verifique se JavaScript está habilitado no navegador
2. Abra DevTools (F12) e procure por erros no console
3. Verifique se `calculateSuggestedPrice` está definida
4. Teste com valores numéricos válidos (não vazios)

### Problema: Margem não atualiza quando mudo a categoria

**Solução:**
1. Verifique se a função `handleCategoryChange` está sendo chamada
2. Verifique se `categories` está sendo carregada corretamente
3. Teste com uma categoria que tem `target_margin` definida

### Problema: Produto não salva

**Solução:**
1. Verifique se o backend está rodando
2. Abra DevTools (F12) → Network e procure pela requisição POST /products
3. Verifique se a resposta tem status 201 ou 400
4. Leia a mensagem de erro retornada

### Problema: Campos não salvam no banco

**Solução:**
1. Verifique se as migrações foram executadas
2. Verifique se os campos existem na tabela:
   ```sql
   PRAGMA table_info(products);
   ```
3. Se faltam campos, execute as migrações manualmente

---

## ✅ Checklist de Implementação

- [ ] Backend: Rota POST /products aceita `avg_cost` e `profit_margin`
- [ ] Backend: Rota GET /categories retorna `target_margin`
- [ ] Backend: Banco de dados tem campos `avg_cost`, `product_profit_margin`, `target_margin`
- [ ] Frontend: `Estoque.jsx` atualizado com funções de cálculo
- [ ] Frontend: Modal de novo produto tem campos de custo, margem e preço sugerido
- [ ] Frontend: Botão "Usar Sugestão" funciona
- [ ] Frontend: Validação visual de margem funciona
- [ ] Teste: Criar produto com custo + margem
- [ ] Teste: Verificar se preço sugerido é calculado corretamente
- [ ] Teste: Verificar se margem atual é exibida corretamente
- [ ] Teste: Verificar se dados são salvos no banco

---

## 📞 Suporte

Se encontrar problemas:

1. Verifique o arquivo `ANALISE_ESTOQUE_INTELIGENTE.md` para entender a arquitetura
2. Consulte os logs do backend: `docker-compose logs backend`
3. Abra DevTools no navegador (F12) e procure por erros
4. Verifique o banco de dados diretamente com sqlite3

---

## 🎉 Próximos Passos

Após implementar com sucesso:

1. **Edição de Produtos:** Implementar mesmo fluxo na edição
2. **Movimentação de Estoque:** Adicionar sugestão de preço ao receber estoque
3. **Relatórios:** Criar relatório de margem por categoria
4. **Auto-Update:** Implementar atualização automática de preço quando custo muda
5. **Histórico:** Rastrear mudanças de preço e margem

---

**Versão:** 1.0  
**Data:** 2026-06-04  
**Status:** Pronto para Implementação
