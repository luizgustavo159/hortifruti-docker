# Análise do Sistema de Autenticação e Controle de Acesso - Hortifruti

## Problemas Identificados

### 1. **Redirecionamento Pós-Login Hardcoded**
- **Arquivo**: `frontend/src/context/AuthContext.jsx` (linha 84)
- **Problema**: Todos os usuários são redirecionados para `/caixa` após login, independente do role
- **Impacto**: Operadores vão para `/caixa` (correto), mas admins também vão para `/caixa` em vez de `/admin`
- **Solução**: Redirecionar baseado no role do usuário

### 2. **Inconsistência na Verificação de Roles**
- **Arquivo**: `frontend/src/lib/auth.js` vs `frontend/src/context/AuthContext.jsx`
- **Problema**: Duas implementações diferentes de `hasRole()` e `hasExactRole()`
- **Impacto**: Possíveis inconsistências na validação de permissões
- **Solução**: Unificar a lógica em um único lugar

### 3. **Visibilidade de Abas Baseada em Role Hierarchy**
- **Arquivo**: `frontend/src/components/Sidebar.jsx` (linha 22)
- **Problema**: A função `hasRequiredRole()` usa um sistema de hierarquia (operator=1, supervisor=2, manager=3, admin=4)
- **Impacto**: Um supervisor vê tudo que um operator vê, um manager vê tudo que um supervisor vê, etc.
- **Problema Adicional**: A lógica de permissões no backend (AdminFuncionarios.jsx) atribui permissões específicas, mas o frontend não as usa
- **Solução**: Implementar um sistema de permissões granulares baseado em roles específicos, não hierarquia

### 4. **Seed de Usuários Incompleto**
- **Arquivo**: `scripts/seed-demo.js` ou `scripts/seed_emulation.js`
- **Problema**: Não há seed de usuários de teste para cada perfil
- **Impacto**: Difícil testar o sistema com diferentes roles
- **Solução**: Criar seed com usuários de cada perfil (admin, manager, supervisor, operator)

### 5. **Inconsistência no Redirecionamento Pós-Login**
- **Arquivo**: `frontend/src/pages/Login.jsx` (linha 19)
- **Problema**: Hardcoded para `/caixa`
- **Solução**: Usar a mesma lógica de redirecionamento do AuthContext

## Plano de Correção

### Fase 1: Sincronizar Lógica de Roles
1. Unificar `hasRole()` em um único lugar (usar `lib/auth.js`)
2. Atualizar `AuthContext.jsx` para usar a função unificada
3. Garantir que ambos retornam os mesmos resultados

### Fase 2: Corrigir Redirecionamento Pós-Login
1. Implementar função `getDefaultRoute(role)` que retorna a rota padrão para cada role
2. Atualizar `AuthContext.jsx` para usar essa função
3. Atualizar `Login.jsx` para usar a mesma lógica

### Fase 3: Corrigir Visibilidade de Abas
1. Atualizar `Sidebar.jsx` para usar roles específicos, não hierarquia
2. Definir claramente quais abas cada role pode ver
3. Testar com cada role

### Fase 4: Criar Seed de Usuários
1. Criar script que insere usuários de teste para cada role
2. Usar senhas conhecidas para facilitar testes
3. Executar o seed na inicialização

### Fase 5: Testar e Validar
1. Testar login com cada role
2. Verificar redirecionamento correto
3. Verificar visibilidade de abas
4. Verificar acesso a rotas protegidas

## Definição de Permissões por Role

### Operator (Operador)
- Caixa PDV ✓
- Estoque ✓
- Descontos ✗
- Dashboard ✗
- Relatórios ✗
- Funcionários ✗
- Logs ✗
- Configurações ✗

### Supervisor
- Caixa PDV ✓
- Estoque ✓
- Descontos ✓
- Dashboard ✓
- Relatórios ✓
- Funcionários ✗
- Logs ✓
- Configurações ✗

### Manager
- Caixa PDV ✓
- Estoque ✓
- Descontos ✓
- Dashboard ✓
- Relatórios ✓
- Funcionários ✗
- Logs ✓
- Configurações ✗

### Admin
- Caixa PDV ✓
- Estoque ✓
- Descontos ✓
- Dashboard ✓
- Relatórios ✓
- Funcionários ✓
- Logs ✓
- Configurações ✓

## Rotas Padrão Pós-Login

- Operator → `/caixa`
- Supervisor → `/admin`
- Manager → `/admin`
- Admin → `/admin`
