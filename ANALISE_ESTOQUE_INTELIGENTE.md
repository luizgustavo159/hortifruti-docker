# Análise: Estoque Inteligente com Cálculo Automático de Preço

## 📊 Status Atual da Integração

### ✅ O que JÁ está implementado:

#### 1. **Banco de Dados** (Completo)
- ✅ Migração `011_add_product_costs.sql`: Adiciona campos `avg_cost`, `last_cost`, `profit_margin`
- ✅ Migração `013_add_margin_control.sql`: Adiciona `product_profit_margin`, `price_manually_adjusted`
- ✅ Migração `014_smart_inventory_autopilot.sql`: Adiciona `target_margin` nas categorias, `auto_update_price` nos produtos
- ✅ View `v_product_margins`: Calcula margem efetiva (produto → categoria → global)
- ✅ Campos nas tabelas:
  - `products.avg_cost` - Custo médio ponderado
  - `products.last_cost` - Último custo informado
  - `products.profit_margin` - Margem de lucro desejada
  - `products.product_profit_margin` - Margem específica do produto
  - `categories.target_margin` - Margem alvo da categoria (padrão 30%)

#### 2. **Backend** (Parcialmente Implementado)
- ✅ Helper `src/helpers/pricing-helpers.js`: Funções de cálculo prontas
  - `calculateSuggestedPrice(avgCost, profitMarginPercent)` ← **FUNÇÃO CHAVE**
  - `calculateCurrentMarginPercent(currentPrice, avgCost)`
  - `calculateWeightedAverageCost()` - Cálculo automático de custo médio
  - `calculateProfitPerUnit()`, `calculateTotalProfitInStock()`

- ✅ Rota `POST /products`: Aceita `avg_cost` no cadastro
- ✅ Rota `POST /stock/adjust`: Atualiza `avg_cost` automaticamente com custo ponderado
- ✅ Rota `PUT /products/:id/price`: Permite atualizar preço sugerido
- ✅ Rota `GET /categories`: Retorna `target_margin`

#### 3. **Frontend** (INCOMPLETO - AQUI ESTÁ O PROBLEMA)
- ❌ **Falta**: Cálculo automático em tempo real no modal de novo produto
- ❌ **Falta**: Campo de margem de lucro no formulário
- ❌ **Falta**: Sugestão de preço atualizada dinamicamente
- ❌ **Falta**: Validação visual (alerta se margem está baixa)

---

## 🔴 Problema Identificado

No arquivo `frontend/src/pages/Estoque.jsx` (linhas 239-298):

```jsx
// ATUAL - SEM CÁLCULO AUTOMÁTICO
<div className="form-group">
  <label>Preço de Venda (R$)</label>
  <input placeholder="0.00" type="number" value={newProduct.price} 
    onChange={e => setNewProduct({...newProduct, price: e.target.value})} 
    className="input" />
</div>

<div className="form-group">
  <label>Custo Médio (R$)</label>
  <input placeholder="0.00" type="number" value={newProduct.avg_cost} 
    onChange={e => setNewProduct({...newProduct, avg_cost: e.target.value})} 
    className="input" />
</div>
```

**O que está faltando:**
1. Campo de **Margem de Lucro (%)** no formulário
2. Função para **calcular preço sugerido** quando custo + margem são preenchidos
3. **Atualização em tempo real** do preço sugerido
4. **Validação visual** mostrando a margem atual vs. alvo
5. Integração com a **margem da categoria** como padrão

---

## ✨ Solução Proposta

### 1. Adicionar Campos ao Estado do Formulário

```jsx
const [newProduct, setNewProduct] = useState({ 
  name: "", 
  sku: "", 
  category_id: "", 
  supplier_id: "", 
  price: "", 
  current_stock: "0", 
  min_stock: "0", 
  unit_type: "un", 
  avg_cost: "",
  profit_margin: "30"  // ← NOVO: Margem padrão
});
```

### 2. Criar Função de Cálculo Automático

```jsx
// Calcular preço sugerido baseado em custo + margem
const calculateSuggestedPrice = (cost, margin) => {
  if (!cost || cost <= 0 || !margin || margin < 0) return 0;
  const suggested = parseFloat(cost) * (1 + parseFloat(margin) / 100);
  return Math.round(suggested * 100) / 100;
};

// Calcular margem atual baseada em preço e custo
const calculateCurrentMargin = (price, cost) => {
  if (!price || !cost || price <= 0 || cost <= 0) return 0;
  const margin = ((parseFloat(price) - parseFloat(cost)) / parseFloat(price)) * 100;
  return Math.round(margin * 100) / 100;
};
```

### 3. Adicionar Campos Visuais no Modal

```jsx
{/* Margem de Lucro (%) */}
<div className="form-group">
  <label>Margem de Lucro (%)</label>
  <input 
    placeholder="30" 
    type="number" 
    value={newProduct.profit_margin} 
    onChange={e => setNewProduct({...newProduct, profit_margin: e.target.value})} 
    className="input" 
  />
  <small>Padrão da categoria: {selectedCategoryMargin}%</small>
</div>

{/* Preço Sugerido (Calculado) */}
<div className="form-group">
  <label>Preço Sugerido (R$)</label>
  <div className="suggested-price-display">
    <strong>R$ {calculateSuggestedPrice(newProduct.avg_cost, newProduct.profit_margin).toFixed(2)}</strong>
    <button 
      type="button" 
      className="btn-use-suggested"
      onClick={() => setNewProduct({
        ...newProduct, 
        price: calculateSuggestedPrice(newProduct.avg_cost, newProduct.profit_margin).toString()
      })}
    >
      Usar Sugestão
    </button>
  </div>
</div>

{/* Preço de Venda (Editável) */}
<div className="form-group">
  <label>Preço de Venda (R$)</label>
  <input 
    placeholder="0.00" 
    type="number" 
    value={newProduct.price} 
    onChange={e => setNewProduct({...newProduct, price: e.target.value})} 
    className="input" 
  />
  <small className={calculateCurrentMargin(newProduct.price, newProduct.avg_cost) >= parseFloat(newProduct.profit_margin) ? "text-success" : "text-danger"}>
    Margem atual: {calculateCurrentMargin(newProduct.price, newProduct.avg_cost).toFixed(1)}%
  </small>
</div>
```

### 4. Integração com Categoria (Carregar Margem Padrão)

```jsx
// Quando categoria é selecionada, atualizar margem padrão
const handleCategoryChange = (categoryId) => {
  const category = categories.find(c => c.id === parseInt(categoryId));
  setNewProduct({
    ...newProduct,
    category_id: categoryId,
    profit_margin: category?.target_margin || "30"
  });
};
```

---

## 📋 Fluxo de Dados Completo

```
FRONTEND (Estoque.jsx)
├─ Usuário preenche: Custo + Margem
├─ JavaScript calcula: Preço Sugerido = Custo × (1 + Margem%)
├─ Usuário clica "Usar Sugestão" OU digita preço manual
│
└─→ POST /products (Backend)
    ├─ Recebe: { name, avg_cost, price, profit_margin, ... }
    ├─ Salva no DB: products table
    │  └─ avg_cost, last_cost, product_profit_margin
    │
    └─→ GET /products (Frontend)
        ├─ Retorna lista com todos os campos
        └─ Exibe na tabela com cálculo de margem atual
```

---

## 🔧 Implementação Passo a Passo

### Fase 1: Backend (Validar)
- ✅ Verificar se rota `POST /products` aceita `profit_margin`
- ✅ Verificar se rota retorna `avg_cost`, `last_cost`, `product_profit_margin`

### Fase 2: Frontend (Implementar)
1. Adicionar campos ao estado
2. Criar funções de cálculo
3. Atualizar modal com novos campos
4. Adicionar validações visuais
5. Testar fluxo completo

### Fase 3: CSS (Estilizar)
- Adicionar estilos para:
  - `.suggested-price-display` - Destaque da sugestão
  - `.btn-use-suggested` - Botão de usar sugestão
  - `.text-success` / `.text-danger` - Cores de margem

---

## 📌 Arquivos a Modificar

1. **`frontend/src/pages/Estoque.jsx`** - Principal
   - Adicionar estado `profit_margin`
   - Adicionar funções de cálculo
   - Atualizar modal de novo produto
   - Adicionar validações

2. **`frontend/src/pages/Estoque.css`** - Estilos
   - Adicionar classes para sugestão de preço
   - Melhorar layout do formulário

3. **`src/routes/index.js`** - Backend (Verificar)
   - Confirmar que POST /products aceita `profit_margin`
   - Confirmar que retorna todos os campos necessários

---

## 🎯 Resultado Esperado

Quando o usuário cadastrar um novo produto:

1. ✅ Preenche: Nome, SKU, Categoria, Fornecedor
2. ✅ Preenche: Custo (R$) = 10.00
3. ✅ Seleciona: Margem (%) = 30 (vem da categoria)
4. ✅ Sistema calcula automaticamente: **Preço Sugerido = R$ 14.29**
5. ✅ Usuário clica "Usar Sugestão" → Preço é preenchido
6. ✅ Sistema mostra: "Margem atual: 30.0% ✓"
7. ✅ Usuário clica "Cadastrar Produto"
8. ✅ Produto salvo com todos os dados no banco

---

## 🚀 Próximos Passos

1. Implementar as mudanças no `Estoque.jsx`
2. Testar o fluxo completo
3. Adicionar validações de erro
4. Implementar edição de produtos existentes com mesmo fluxo
5. Adicionar sugestão de preço na tela de movimentação de estoque
