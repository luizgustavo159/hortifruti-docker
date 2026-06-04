const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../../db");
const config = require("../../config");
const { isTokenBlacklisted } = require("../middleware/tokenManagement");
const { productSchema, productUpdateSchema, validate } = require("../validators/schemas");

const router = express.Router();
const authRouter = require("./auth");
const { JWT_SECRET } = config;

// --- AUTH ROUTES ---
router.use("/auth", authRouter);

// --- MIDDLEWARES ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Token não informado." });
  const token = authHeader.replace("Bearer ", "");
  
  return jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) return res.status(403).json({ message: "Token inválido." });
    
    if (await isTokenBlacklisted(token)) {
      return res.status(401).json({ message: "Sessão encerrada." });
    }

    db.get("SELECT * FROM sessions WHERE token = ? AND revoked_at IS NULL", [token], (sessionErr, session) => {
      if (sessionErr || !session) return res.status(401).json({ message: "Sessão expirada." });
      req.user = user;
      return next();
    });
  });
};

const requireRole = (role) => (req, res, next) => {
  const levels = { operator: 1, supervisor: 2, manager: 3, admin: 4 };
  if ((levels[req.user?.role] || 0) < levels[role]) return res.status(403).json({ message: "Acesso não autorizado." });
  next();
};

const runWithTransaction = (work, callback) => {
  db.withTransaction((tx, finish) => { work(tx, finish); }, callback);
};

const createAuditLog = (action, details, performed_by, type = 'info', level = 'low') => {
  db.run("INSERT INTO audit_logs (action, details, performed_by, type, level) VALUES (?, ?, ?, ?, ?)",
    [action, JSON.stringify(details), performed_by, type, level], (err) => {
      if (err) console.error("Erro ao gravar log de auditoria:", err);
    });
};

// --- CLIENTES ---
router.get("/customers", authenticateToken, (req, res) => {
    db.all("SELECT * FROM customers ORDER BY name", [], (err, rows) => res.json(rows));
});

router.post("/customers", authenticateToken, requireRole("supervisor"), (req, res) => {
    const { name, phone, credit_limit } = req.body;
    db.get("INSERT INTO customers (name, phone, credit_limit) VALUES (?, ?, ?) RETURNING id", [name, phone, credit_limit], (err, row) => {
        if (err) return res.status(400).json({ message: "Erro ao criar cliente." });
        res.status(201).json(row);
    });
});

// --- PRODUTOS ---
router.get("/products", authenticateToken, (req, res) => {
  db.all(`
    SELECT 
      p.*,
      c.name AS category_name, 
      s.name AS supplier_name, 
      c.target_margin as category_margin,
      COALESCE(p.product_profit_margin, CAST(COALESCE((SELECT value FROM settings WHERE key = 'default_profit_margin'), '30') AS NUMERIC)) as target_margin,
      CASE 
        WHEN p.avg_cost > 0 AND p.price > 0 THEN ROUND(((p.price - p.avg_cost) / p.price) * 100, 2)
        ELSE 0
      END as current_margin_percent,
      CASE 
        WHEN p.avg_cost > 0 AND p.price > 0 THEN
          CASE 
            WHEN ROUND(((p.price - p.avg_cost) / p.price) * 100, 2) < COALESCE(p.product_profit_margin, CAST(COALESCE((SELECT value FROM settings WHERE key = 'default_profit_margin'), '30') AS NUMERIC)) THEN 'low_margin'
            WHEN ROUND(((p.price - p.avg_cost) / p.price) * 100, 2) > (COALESCE(p.product_profit_margin, CAST(COALESCE((SELECT value FROM settings WHERE key = 'default_profit_margin'), '30') AS NUMERIC)) + 10) THEN 'high_margin'
            ELSE 'ok'
          END
        ELSE 'no_cost'
      END as margin_status,
      (SELECT SUM(quantity) FROM product_batches WHERE product_id = p.id AND quantity > 0) as batch_stock_total
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.deleted_at IS NULL
    ORDER BY p.name
  `, [], (err, rows) => res.json(rows || []));
});

router.post("/products", authenticateToken, requireRole("supervisor"), validate(productSchema), (req, res) => {
  const { name, sku, unit_type, price, category_id, supplier_id, min_stock, current_stock, avg_cost, profit_margin, image_url } = req.validated;
  db.get(
    "INSERT INTO products (name, sku, unit_type, price, category_id, supplier_id, min_stock, current_stock, avg_cost, product_profit_margin, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
    [name, sku, unit_type, price, category_id, supplier_id, min_stock, current_stock, avg_cost, profit_margin, image_url],
    (err, row) => {
      if (err) {
        createAuditLog("ERRO_CRIAR_PRODUTO", { error: err.message, payload: req.body }, req.user.id, 'error', 'high');
        return res.status(400).json({ message: "Erro ao criar produto: " + err.message });
      }
      createAuditLog("PRODUTO_CRIADO", { product_id: row.id, name: row.name }, req.user.id, 'info', 'low');
      res.status(201).json(row);
    }
  );
});

router.put("/products/:id/price", authenticateToken, requireRole("supervisor"), (req, res) => {
    const { price } = req.body;
    db.run("UPDATE products SET price = ? WHERE id = ?", [price, req.params.id], (err) => {
        if (err) return res.status(500).json({ message: "Erro ao atualizar preço." });
        db.get("SELECT * FROM products WHERE id = ?", [req.params.id], (errGet, product) => {
            res.json(product || { status: "ok" });
        });
    });
});

router.put("/products/:id", authenticateToken, requireRole("supervisor"), validate(productUpdateSchema), (req, res) => {
    const { name, sku, unit_type, price, category_id, supplier_id, min_stock, current_stock, avg_cost, profit_margin, image_url } = req.validated;
    db.run(
        "UPDATE products SET name=?, sku=?, unit_type=?, price=?, category_id=?, supplier_id=?, min_stock=?, current_stock=?, avg_cost=?, product_profit_margin=?, image_url=? WHERE id=?",
        [name, sku, unit_type, price, category_id, supplier_id, min_stock, current_stock, avg_cost, profit_margin, image_url, req.params.id],
        (err) => {
            if (err) {
                createAuditLog("ERRO_ATUALIZAR_PRODUTO", { product_id: req.params.id, error: err.message, payload: req.body }, req.user.id, 'error', 'high');
                return res.status(500).json({ message: "Erro ao atualizar produto: " + err.message });
            }
            db.get("SELECT * FROM products WHERE id = ?", [req.params.id], (errGet, product) => {
                createAuditLog("PRODUTO_ATUALIZADO", { product_id: req.params.id, name: product?.name }, req.user.id, 'info', 'low');
                res.json(product || { status: "ok" });
            });
        }
    );
});

// --- ESTOQUE ---
router.post("/stock/adjust", authenticateToken, requireRole("supervisor"), (req, res) => {
  const { product_id, delta, reason, unit_cost } = req.body;
  db.withTransaction((tx, finish) => {
    tx.get("SELECT current_stock, avg_cost FROM products WHERE id = ?", [product_id], (err, p) => {
      if (err || !p) return finish(err || new Error("Produto não encontrado"));

      let newAvgCost = Number(p.avg_cost || 0);
      const currentStock = Number(p.current_stock || 0);
      const deltaQty = Number(delta);
      const cost = Number(unit_cost || 0);

      if (deltaQty > 0 && cost > 0) {
        const totalValue = (currentStock * newAvgCost) + (deltaQty * cost);
        const totalQty = currentStock + deltaQty;
        newAvgCost = totalQty > 0 ? totalValue / totalQty : cost;
      }

      tx.run("UPDATE products SET current_stock = current_stock + ?, avg_cost = ? WHERE id = ?", 
        [deltaQty, newAvgCost, product_id], (errU) => {
          if (errU) return finish(errU);
          
          if (deltaQty > 0) {
            tx.run("INSERT INTO product_batches (product_id, initial_quantity, quantity, unit_cost) VALUES (?, ?, ?, ?)",
              [product_id, deltaQty, deltaQty, cost], (errB) => {
                if (errB) return finish(errB);
                tx.run("INSERT INTO stock_movements (product_id, type, delta, reason, performed_by) VALUES (?, ?, ?, ?, ?)",
                  [product_id, 'inbound', deltaQty, reason, req.user.id], (errM) => finish(errM));
              });
          } else {
            let remainingToConsume = Math.abs(deltaQty);
            tx.all("SELECT id, quantity FROM product_batches WHERE product_id = ? AND quantity > 0 ORDER BY received_at ASC", [product_id], (errL, batches) => {
              if (errL) return finish(errL);
              
              const consumeNextBatch = (index) => {
                if (remainingToConsume <= 0 || index >= batches.length) {
                  return tx.run("INSERT INTO stock_movements (product_id, type, delta, reason, performed_by) VALUES (?, ?, ?, ?, ?)",
                    [product_id, 'outbound', deltaQty, reason, req.user.id], (errM) => finish(errM));
                }
                
                const batch = batches[index];
                const consumeAmount = Math.min(batch.quantity, remainingToConsume);
                remainingToConsume -= consumeAmount;
                
                tx.run("UPDATE product_batches SET quantity = quantity - ? WHERE id = ?", [consumeAmount, batch.id], (errCB) => {
                  if (errCB) return finish(errCB);
                  consumeNextBatch(index + 1);
                });
              };
              consumeNextBatch(0);
            });
          }
        });
    });
  }, (err) => {
    if (err) {
      createAuditLog("ERRO_AJUSTE_ESTOQUE", { product_id, error: err.message }, req.user.id, 'error', 'high');
      return res.status(500).json({ message: "Erro ao ajustar estoque: " + err.message });
    }
    res.json({ status: "ok" });
  });
});

router.post("/stock/loss", authenticateToken, (req, res) => {
    const { product_id, quantity, reason } = req.body;
    db.withTransaction((tx, finish) => {
      tx.run("UPDATE products SET current_stock = current_stock - ? WHERE id = ?", [quantity, product_id], (err) => {
        if (err) return finish(err);
        
        let remainingToConsume = Math.abs(Number(quantity));
        tx.all("SELECT id, quantity FROM product_batches WHERE product_id = ? AND quantity > 0 ORDER BY received_at ASC", [product_id], (errL, batches) => {
          if (errL) return finish(errL);
          
          const consumeNextBatch = (index) => {
            if (remainingToConsume <= 0 || index >= batches.length) {
              return tx.run("INSERT INTO stock_losses (product_id, quantity, reason) VALUES (?, ?, ?)",
                [product_id, quantity, reason], (errSL) => finish(errSL));
            }
            
            const batch = batches[index];
            const consumeAmount = Math.min(batch.quantity, remainingToConsume);
            remainingToConsume -= consumeAmount;
            
            tx.run("UPDATE product_batches SET quantity = quantity - ? WHERE id = ?", [consumeAmount, batch.id], (errCB) => {
              if (errCB) return finish(errCB);
              consumeNextBatch(index + 1);
            });
          };
          consumeNextBatch(0);
        });
      });
    }, (err) => {
      if (err) {
        createAuditLog("ERRO_REGISTRAR_PERDA", { product_id, error: err.message }, req.user.id, 'error', 'high');
        return res.status(500).json({ message: "Erro ao registrar perda: " + err.message });
      }
      res.json({ status: "ok" });
    });
});

// --- DESCONTOS ---
router.get("/discounts", authenticateToken, (req, res) => {
  db.all("SELECT * FROM discounts ORDER BY priority DESC, created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ message: "Erro ao buscar descontos." });
    res.json(rows);
  });
});

router.post("/discounts", authenticateToken, requireRole("manager"), (req, res) => {
  const { name, type, value, description, target_type, target_value, min_quantity, buy_quantity, get_quantity, starts_at, ends_at, starts_time, ends_time, days_of_week, stacking_rule, priority, active } = req.body;
  db.get(`
    INSERT INTO discounts (name, type, value, description, target_type, target_value, min_quantity, buy_quantity, get_quantity, starts_at, ends_at, starts_time, ends_time, days_of_week, stacking_rule, priority, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
  `, [name, type, value, description, target_type, target_value, min_quantity, buy_quantity, get_quantity, starts_at, ends_at, starts_time, ends_time, days_of_week, stacking_rule, priority, active], 
  (err, row) => {
    if (err) return res.status(400).json({ message: "Erro ao criar desconto." });
    res.status(201).json(row);
  });
});

router.put("/discounts/:id", authenticateToken, requireRole("manager"), (req, res) => {
  const { name, type, value, description, target_type, target_value, min_quantity, buy_quantity, get_quantity, starts_at, ends_at, starts_time, ends_time, days_of_week, stacking_rule, priority, active } = req.body;
  db.run(`
    UPDATE discounts SET name=?, type=?, value=?, description=?, target_type=?, target_value=?, min_quantity=?, buy_quantity=?, get_quantity=?, starts_at=?, ends_at=?, starts_time=?, ends_time=?, days_of_week=?, stacking_rule=?, priority=?, active=?
    WHERE id = ?
  `, [name, type, value, description, target_type, target_value, min_quantity, buy_quantity, get_quantity, starts_at, ends_at, starts_time, ends_time, days_of_week, stacking_rule, priority, active, req.params.id], 
  (err) => {
    if (err) return res.status(400).json({ message: "Erro ao atualizar desconto." });
    res.json({ status: "ok" });
  });
});

router.delete("/discounts/:id", authenticateToken, requireRole("manager"), (req, res) => {
  db.run("DELETE FROM discounts WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ message: "Erro ao excluir desconto." });
    res.json({ status: "ok" });
  });
});

// --- CAIXA (POS) ---
router.get("/pos/cash-session/current", authenticateToken, (req, res) => {
  db.get("SELECT * FROM cash_sessions WHERE operator_id = ? AND closed_at IS NULL", [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ message: "Erro ao buscar sessão de caixa." });
    res.json(row || null);
  });
});

router.post("/pos/cash-session/open", authenticateToken, (req, res) => {
  const { opening_amount, notes } = req.body;
    db.get("INSERT INTO cash_sessions (operator_id, opening_amount, notes) VALUES (?, ?, ?) RETURNING *",
    [req.user.id, opening_amount, notes], (err, row) => {
      if (err) return res.status(400).json({ message: "Erro ao abrir caixa." });
      createAuditLog("CAIXA_ABERTO", { opening_amount, notes }, req.user.id, 'system', 'medium');
      res.status(201).json(row);
    });
});

router.post("/pos/cash-session/close", authenticateToken, (req, res) => {
  const { closing_amount, notes } = req.body;
  db.run("UPDATE cash_sessions SET closed_at = CURRENT_TIMESTAMP, closing_amount = ?, notes = ? WHERE operator_id = ? AND closed_at IS NULL",
    [closing_amount, notes, req.user.id], (err) => {
      if (err) return res.status(400).json({ message: "Erro ao fechar caixa." });
      res.json({ status: "ok" });
    });
});

router.get("/pos/cash-session/movement", authenticateToken, (req, res) => {
  db.all(`
    SELECT m.*, u.name as performed_by_name 
    FROM cash_movements m
    JOIN cash_sessions s ON m.session_id = s.id
    JOIN users u ON m.performed_by = u.id
    WHERE s.operator_id = ? AND s.closed_at IS NULL
    ORDER BY m.created_at DESC
  `, [req.user.id], (err, rows) => {
    res.json(rows);
  });
});

router.post("/pos/cash-session/movement", authenticateToken, (req, res) => {
  const { type, amount, reason } = req.body;
  db.get("SELECT id FROM cash_sessions WHERE operator_id = ? AND closed_at IS NULL", [req.user.id], (err, session) => {
    if (!session) return res.status(400).json({ message: "Nenhum caixa aberto." });
    db.run("INSERT INTO cash_movements (session_id, type, amount, reason, performed_by) VALUES (?, ?, ?, ?, ?)",
      [session.id, type, amount, reason, req.user.id], (errM) => {
        if (errM) return res.status(400).json({ message: "Erro ao registrar movimento." });
        res.json({ status: "ok" });
      });
  });
});

// --- VENDAS ---
router.get("/sales/recent", authenticateToken, (req, res) => {
    db.all(`
        SELECT s.*, p.name as product_name, c.name as customer_name 
        FROM sales s 
        JOIN products p ON s.product_id = p.id 
        LEFT JOIN customers c ON s.customer_id = c.id
        ORDER BY s.created_at DESC LIMIT 50
    `, [], (err, rows) => res.json(rows));
});

const { z } = require("zod");

const saleSchema = z.object({
  items: z.array(z.object({
    product_id: z.number().int().positive(),
    quantity: z.number().positive(),
    discount_id: z.number().int().nullable().optional()
  })).min(1),
  payment_method: z.enum(["cash", "pix", "card", "fiado"]),
  customer_id: z.number().int().nullable().optional(),
  manual_discount: z.number().min(0).optional(),
  amount_received: z.number().min(0).optional(),
  change_amount: z.number().min(0).optional(),
  approval_token: z.string().nullable().optional()
});

router.post("/sales", authenticateToken, (req, res) => {
  const validation = saleSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ message: "Dados de venda inválidos.", errors: validation.error.errors });
  }

  const { items, payment_method, customer_id, manual_discount, amount_received, change_amount } = validation.data;
  const manualDiscountAmount = parseFloat(manual_discount) || 0;

  db.withTransaction((tx, finish) => {
    // 1. Validar se o caixa do operador está aberto
    tx.get("SELECT id FROM cash_sessions WHERE operator_id = ? AND closed_at IS NULL", [req.user.id], (errSession, session) => {
      if (errSession || !session) return finish(new Error("Você precisa abrir o caixa antes de realizar vendas."));

      // 2. Validar Limite de Fiado (se aplicável)
      const validateFiado = (callback) => {
        if (payment_method.toLowerCase() === "fiado") {
          if (!customer_id) return finish(new Error("Cliente é obrigatório para vendas em Fiado."));
          tx.get("SELECT credit_limit, current_debt, name FROM customers WHERE id = ?", [customer_id], (errC, customer) => {
            if (errC || !customer) return finish(new Error("Cliente não encontrado."));
            
            // Calcular total da venda para validar limite
            tx.all("SELECT id, price FROM products WHERE id IN (" + items.map(i => i.product_id).join(",") + ")", [], (errP, productsInfo) => {
              const totalVenda = items.reduce((acc, item) => {
                const p = productsInfo.find(pi => pi.id === item.product_id);
                return acc + (p ? p.price * item.quantity : 0);
              }, 0) - manualDiscountAmount;

              if ((Number(customer.current_debt) + totalVenda) > Number(customer.credit_limit)) {
                return finish(new Error(`Limite de crédito excedido para ${customer.name}. Disponível: R$ ${(customer.credit_limit - customer.current_debt).toFixed(2)}`));
              }
              
              tx.run("UPDATE customers SET current_debt = current_debt + ? WHERE id = ?", [totalVenda, customer_id], (errU) => {
                if (errU) return finish(errU);
                callback();
              });
            });
          });
        } else {
          callback();
        }
      };

      validateFiado(() => {
        const processItem = (idx) => {
          if (idx >= items.length) return finish(null);
          const item = items[idx];
          
          tx.get("SELECT * FROM products WHERE id = ?", [item.product_id], (err, p) => {
            if (!p) return finish(new Error(`Produto ID ${item.product_id} não encontrado`));
            if (Number(p.current_stock) < Number(item.quantity)) {
              return finish(new Error(`Estoque insuficiente para ${p.name}.`));
            }

            const subtotal = p.price * item.quantity;
            const totalGeralBruto = items.reduce((acc, it) => acc + (p.id === it.product_id ? p.price * it.quantity : 0), 0); // Simplificado para o item
            const itemProportionalDiscount = manualDiscountAmount > 0 ? (subtotal / items.reduce((a, b) => a + b.quantity, 0)) : 0; // Proporcional simples
            const finalTotal = subtotal - (manualDiscountAmount / items.length);

            // Registrar Venda
            tx.run(
              "INSERT INTO sales (product_id, quantity, total, discount_amount, final_total, payment_method, sold_by, customer_id, amount_received, change_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [item.product_id, item.quantity, subtotal, manualDiscountAmount / items.length, finalTotal, payment_method, req.user.id, customer_id, amount_received || 0, change_amount || 0],
              (errS) => {
                if (errS) return finish(errS);
                
                // Baixar Estoque Global
                tx.run("UPDATE products SET current_stock = current_stock - ? WHERE id = ?", [item.quantity, item.product_id], (errU) => {
                  if (errU) return finish(errU);
                  
                  // Baixar Estoque por Lotes (FIFO)
                  let remaining = Number(item.quantity);
                  tx.all("SELECT id, quantity FROM product_batches WHERE product_id = ? AND quantity > 0 ORDER BY received_at ASC", [item.product_id], (errL, batches) => {
                    if (errL) return finish(errL);
                    
                    const consumeBatches = (bIdx) => {
                      if (remaining <= 0 || bIdx >= batches.length) {
                        createAuditLog("VENDA_REALIZADA", { product_id: item.product_id, qty: item.quantity, total: finalTotal }, req.user.id, 'sale', 'low');
                        return processItem(idx + 1);
                      }
                      const batch = batches[bIdx];
                      const take = Math.min(batch.quantity, remaining);
                      remaining -= take;
                      tx.run("UPDATE product_batches SET quantity = quantity - ? WHERE id = ?", [take, batch.id], (errCB) => {
                        if (errCB) return finish(errCB);
                        consumeBatches(bIdx + 1);
                      });
                    };
                    consumeBatches(0);
                  });
                });
              }
            );
          });
        };
        processItem(0);
      });
    });
  }, (err) => {
    if (err) {
      createAuditLog("ERRO_VENDA", { error: err.message, payload: req.body }, req.user.id, 'error', 'high');
      return res.status(400).json({ message: err.message });
    }
    res.json({ status: "ok" });
  });
});

// --- CATEGORIAS E FORNECEDORES ---
router.get("/categories", authenticateToken, (req, res) => { db.all("SELECT id, name, description, created_at FROM categories ORDER BY name", [], (err, rows) => res.json(rows || [])); });
router.post("/categories", authenticateToken, requireRole("supervisor"), (req, res) => {
    const { name, description } = req.body;
    db.get("INSERT INTO categories (name, description) VALUES (?, ?) RETURNING id", [name, description], (err, row) => {
        if (err) return res.status(400).json({ message: "Erro ao criar categoria." });
        res.status(201).json(row);
    });
});
router.put("/categories/:id", authenticateToken, requireRole("supervisor"), (req, res) => {
    const { name, description } = req.body;
    db.run("UPDATE categories SET name=?, description=? WHERE id=?", [name, description, req.params.id], (err) => {
        if (err) return res.status(400).json({ message: "Erro ao atualizar categoria." });
        res.json({ status: "ok" });
    });
});
router.delete("/categories/:id", authenticateToken, requireRole("manager"), (req, res) => {
    db.run("UPDATE categories SET deleted_at = CURRENT_TIMESTAMP WHERE id=?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ message: "Erro ao excluir categoria." });
        createAuditLog("CATEGORIA_EXCLUIDA", { category_id: req.params.id }, req.user.id, 'system', 'low');
        res.json({ status: "ok" });
    });
});

router.get("/suppliers", authenticateToken, (req, res) => { db.all("SELECT * FROM suppliers", [], (err, rows) => res.json(rows)); });
router.post("/suppliers", authenticateToken, requireRole("supervisor"), (req, res) => {
    const { name, contact, phone, email } = req.body;
    db.get("INSERT INTO suppliers (name, contact, phone, email) VALUES (?, ?, ?, ?) RETURNING id", [name, contact, phone, email], (err, row) => {
        if (err) return res.status(400).json({ message: "Erro ao criar fornecedor." });
        res.status(201).json(row);
    });
});
router.put("/suppliers/:id", authenticateToken, requireRole("supervisor"), (req, res) => {
    const { name, contact, phone, email } = req.body;
    db.run("UPDATE suppliers SET name=?, contact=?, phone=?, email=? WHERE id=?", [name, contact, phone, email, req.params.id], (err) => {
        if (err) return res.status(400).json({ message: "Erro ao atualizar fornecedor." });
        res.json({ status: "ok" });
    });
});
router.delete("/suppliers/:id", authenticateToken, requireRole("manager"), (req, res) => {
    db.run("DELETE FROM suppliers WHERE id=?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ message: "Erro ao excluir fornecedor." });
        res.json({ status: "ok" });
    });
});

// --- REPOSIÇÃO ---
router.get("/stock/restock-suggestions", authenticateToken, (req, res) => {
    db.all(`
        SELECT p.*, c.name as category_name, s.name as supplier_name 
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.current_stock <= p.min_stock
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao buscar sugestões." });
        res.json(rows);
    });
});

// --- CLIENTES ---
router.get("/customers", authenticateToken, (req, res) => {
    db.all("SELECT * FROM customers ORDER BY name", [], (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao buscar clientes." });
        res.json(rows || []);
    });
});

router.post("/customers", authenticateToken, (req, res) => {
    const { name, phone, address, credit_limit } = req.body;
    db.get(
        "INSERT INTO customers (name, phone, address, credit_limit) VALUES (?, ?, ?, ?) RETURNING id",
        [name, phone, address, credit_limit || 500],
        function(err, row) {
            if (err) return res.status(500).json({ message: "Erro ao cadastrar cliente: " + err.message });
            res.status(201).json(row || { id: this.lastID });
        }
    );
});

router.put("/customers/:id", authenticateToken, (req, res) => {
    const { name, phone, address, credit_limit } = req.body;
    db.run(
        "UPDATE customers SET name=?, phone=?, address=?, credit_limit=? WHERE id=?",
        [name, phone, address, credit_limit, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ message: "Erro ao atualizar cliente." });
            res.json({ status: "ok" });
        }
    );
});

// --- USUÁRIOS ---
router.get("/users", authenticateToken, (req, res) => {
  db.all("SELECT id, name, email, role, is_active, phone, permissions, created_at FROM users WHERE is_active = 1", [], (err, rows) => {
    if (err) return res.status(500).json({ message: "Erro ao buscar usuários." });
    res.json(rows);
  });
});

router.post("/users", authenticateToken, requireRole("admin"), async (req, res) => {
  const { name, email, password, role, is_active } = req.body;
  const bcrypt = require("bcryptjs");
  const password_hash = await bcrypt.hash(password, 10);
  db.get("INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?) RETURNING id",
    [name, email, password_hash, role, is_active ? 1 : 0], (err, row) => {
      if (err) return res.status(400).json({ message: "Erro ao criar usuário: " + err.message });
      res.status(201).json(row);
    });
});

router.put("/users/:id", authenticateToken, requireRole("admin"), async (req, res) => {
  const { name, email, password, role, is_active } = req.body;
  if (password) {
    const bcrypt = require("bcryptjs");
    const password_hash = await bcrypt.hash(password, 10);
    db.run("UPDATE users SET name=?, email=?, password_hash=?, role=?, is_active=? WHERE id=?",
      [name, email, password_hash, role, is_active ? 1 : 0, req.params.id], (err) => {
        if (err) return res.status(400).json({ message: "Erro ao atualizar usuário." });
        res.json({ status: "ok" });
      });
  } else {
    db.run("UPDATE users SET name=?, email=?, role=?, is_active=? WHERE id=?",
      [name, email, role, is_active ? 1 : 0, req.params.id], (err) => {
        if (err) return res.status(400).json({ message: "Erro ao atualizar usuário." });
        res.json({ status: "ok" });
      });
  }
});

router.delete("/users/:id", authenticateToken, requireRole("admin"), (req, res) => {
  db.run("UPDATE users SET is_active = 0, deleted_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ message: "Erro ao desativar usuário." });
    createAuditLog("USUARIO_EXCLUIDO", { user_id: req.params.id }, req.user.id, 'security', 'medium');
    res.json({ status: "ok" });
  });
});

// --- RELATÓRIOS ---
router.get("/reports/summary", authenticateToken, requireRole("manager"), (req, res) => {
    const { start, end } = req.query;
    const isoRange = [start + "T00:00:00.000Z", end + "T23:59:59.999Z"];
    
    db.get(`
        SELECT 
            COUNT(*) as total_sales,
            SUM(s.final_total) as total_revenue,
            COALESCE(SUM(s.quantity * p.avg_cost), 0) as total_cost,
            COALESCE((SELECT SUM(l.quantity * pr.avg_cost) FROM stock_losses l JOIN products pr ON l.product_id = pr.id WHERE l.created_at >= $1 AND l.created_at <= $2), 0) as total_losses_value
        FROM sales s
        JOIN products p ON s.product_id = p.id
        WHERE s.created_at >= $3 AND s.created_at <= $4
    `, [...isoRange, ...isoRange], (err, row) => {
        if (err) return res.status(500).json({ message: "Erro ao gerar resumo: " + err.message });
        
        const revenue = parseFloat(row.total_revenue || 0);
        const costOfGoods = parseFloat(row.total_cost || 0);
        const losses = parseFloat(row.total_losses_value || 0);
        const grossProfit = revenue - costOfGoods;
        const netProfit = grossProfit - losses;

        db.all("SELECT * FROM products WHERE current_stock <= min_stock AND deleted_at IS NULL", [], (errStock, lowStock) => {
            res.json({
                total_sales: row.total_sales,
                total_revenue: revenue,
                total_cost: costOfGoods,
                total_losses: losses,
                gross_profit: grossProfit,
                net_profit: netProfit,
                low_stock: lowStock || [],
                profit_margin: revenue > 0 ? ((netProfit / revenue) * 100).toFixed(2) : 0
            });
        });
    });
});

router.get("/reports/by-operator", authenticateToken, requireRole("manager"), (req, res) => {
    const { start, end } = req.query;
    db.all(`
        SELECT u.name as name, COUNT(s.id) as total_items, SUM(s.final_total) as total_revenue
        FROM sales s
        JOIN users u ON s.sold_by = u.id
        WHERE s.created_at BETWEEN ? AND ?
        GROUP BY u.id
    `, [start + " 00:00:00", end + " 23:59:59"], (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao gerar relatório por operador." });
        res.json(rows);
    });
});

router.get("/reports/by-category", authenticateToken, requireRole("manager"), (req, res) => {
    const { start, end } = req.query;
    db.all(`
        SELECT c.name as category, COUNT(s.id) as total_items, SUM(s.final_total) as total_revenue
        FROM sales s
        JOIN products p ON s.product_id = p.id
        JOIN categories c ON p.category_id = c.id
        WHERE s.created_at >= ? AND s.created_at <= ?
        GROUP BY c.id
    `, [start + "T00:00:00.000Z", end + "T23:59:59.999Z"], (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao gerar relatório por categoria." });
        res.json(rows);
    });
});

router.get("/reports/losses", authenticateToken, requireRole("manager"), (req, res) => {
    const { start, end } = req.query;
    db.all(`
        SELECT l.*, p.name as product_name, (l.quantity * p.avg_cost) as financial_loss
        FROM stock_losses l
        JOIN products p ON l.product_id = p.id
        WHERE l.created_at >= ? AND l.created_at <= ?
        ORDER BY l.created_at DESC
    `, [start + "T00:00:00.000Z", end + "T23:59:59.999Z"], (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao gerar relatório de perdas." });
        res.json(rows);
    });
});

// --- CADERNETA (FIADO) ---
router.get("/caderneta", authenticateToken, (req, res) => {
    db.all(`
        SELECT c.*, 
               (SELECT SUM(final_total) FROM sales WHERE customer_id = c.id AND payment_method = 'Fiado') as total_fiado,
               (SELECT MAX(created_at) FROM sales WHERE customer_id = c.id) as last_purchase
        FROM customers c
        WHERE c.current_debt > 0
        ORDER BY c.name
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao carregar caderneta." });
        res.json(rows);
    });
});

router.get("/caderneta/:id/history", authenticateToken, (req, res) => {
    const customerId = req.params.id;
    db.all(`
        WITH combined_history AS (
            SELECT 
                'venda'::text as type, 
                s.final_total as amount, 
                s.created_at, 
                s.payment_method, 
                string_agg(p.name::text, ', ') as items
            FROM sales s
            JOIN products p ON s.product_id = p.id
            WHERE s.customer_id = ?::integer
            GROUP BY s.id, s.final_total, s.created_at, s.payment_method
            
            UNION ALL
            
            SELECT 
                'pagamento'::text as type, 
                cp.amount, 
                cp.created_at, 
                cp.payment_method, 
                'Pagamento de Dívida'::text as items
            FROM customer_payments cp
            WHERE cp.customer_id = ?::integer
        )
        SELECT * FROM combined_history ORDER BY created_at DESC
    `, [customerId, customerId], (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao carregar histórico." });
        res.json(rows);
    });
});

router.post("/caderneta/pay", authenticateToken, (req, res) => {
    const { customer_id, amount, payment_method } = req.body;
    if (!customer_id || !amount || amount <= 0) {
        return res.status(400).json({ message: "Dados de pagamento inválidos." });
    }

    db.withTransaction((tx, finish) => {
        // 1. Verificar se o operador tem um caixa aberto para registrar a entrada de dinheiro
        tx.get("SELECT id FROM cash_sessions WHERE operator_id = ? AND closed_at IS NULL", [req.user.id], (errSession, session) => {
            if (errSession || !session) return finish(new Error("Você precisa abrir o caixa para registrar pagamentos."));

            // 2. Registrar o pagamento na caderneta
            tx.run(
                "INSERT INTO customer_payments (customer_id, amount, payment_method, received_by) VALUES (?, ?, ?, ?)",
                [customer_id, amount, payment_method, req.user.id],
                (errP) => {
                    if (errP) return finish(errP);

                    // 3. Atualizar a dívida do cliente
                    tx.run(
                        "UPDATE customers SET current_debt = current_debt - ? WHERE id = ?",
                        [amount, customer_id],
                        (errU) => {
                            if (errU) return finish(errU);

                            // 4. Registrar movimento no caixa (apenas se for dinheiro)
                            if (payment_method.toLowerCase() === 'cash' || payment_method.toLowerCase() === 'dinheiro') {
                                tx.run(
                                    "INSERT INTO cash_movements (session_id, type, amount, reason, performed_by) VALUES (?, 'in', ?, ?, ?)",
                                    [session.id, amount, `PAGAMENTO CADERNETA - CLIENTE ID ${customer_id}`, req.user.id],
                                    (errM) => {
                                        if (errM) return finish(errM);
                                        createAuditLog("PAGAMENTO_CADERNETA", { customer_id, amount, method: payment_method, session_id: session.id }, req.user.id, 'payment', 'low');
                                        finish(null);
                                    }
                                );
                            } else {
                                createAuditLog("PAGAMENTO_CADERNETA", { customer_id, amount, method: payment_method, session_id: session.id }, req.user.id, 'payment', 'low');
                                finish(null);
                            }
                        }
                    );
                }
            );
        });
    }, (err) => {
        if (err) return res.status(400).json({ message: err.message });
        res.json({ status: "ok" });
    });
});

// --- AUDITORIA (LOGS) ---
router.get("/logs", authenticateToken, requireRole("manager"), (req, res) => {
    const { start, end, type, level } = req.query;
    let query = `
        SELECT l.*, u.name as user_name 
        FROM audit_logs l
        LEFT JOIN users u ON l.performed_by = u.id
        WHERE l.created_at BETWEEN ? AND ?
    `;
    const params = [start + " 00:00:00", end + " 23:59:59"];

    if (type && type !== 'all') {
        query += " AND l.type = ?";
        params.push(type);
    }
    if (level && level !== 'all') {
        query += " AND l.level = ?";
        params.push(level);
    }

    query += " ORDER BY l.created_at DESC LIMIT 500";

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao buscar logs: " + err.message });
        res.json(rows);
    });
});

// --- CONFIGURAÇÕES ---
router.get("/settings", authenticateToken, (req, res) => {
  db.all("SELECT * FROM settings", [], (err, rows) => {
    const settings = {};
    rows.forEach(r => settings[r.key] = r.value);
    res.json(settings);
  });
});

router.put("/settings", authenticateToken, requireRole("admin"), (req, res) => {
  const settings = req.body;
  runWithTransaction((tx, finish) => {
    Object.keys(settings).forEach(key => {
      tx.run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value", [key, settings[key]]);
    });
    finish(null);
  }, (err) => res.json({ status: "ok" }));
});

// --- RELATÓRIOS (EXTRAS) ---
router.get("/reports/hourly-sales", authenticateToken, requireRole("manager"), (req, res) => { res.json([]); });

// --- APROVAÇÕES ---
router.post("/approvals", authenticateToken, async (req, res) => {
  const { password, action, reason } = req.body;
  const bcrypt = require("bcryptjs");

  // Buscar o usuário logado para verificar se ele mesmo é gerente ou se informou senha de um gerente
  db.get("SELECT * FROM users WHERE (role IN ('manager', 'admin')) AND is_active = 1", [], async (err, manager) => {
    if (err || !manager) return res.status(403).json({ message: "Nenhum gerente ativo encontrado para aprovação." });

    // Aqui, em um sistema real, poderíamos pedir o e-mail do gerente também. 
    // Para simplificar o fluxo de PDV, vamos validar se a senha fornecida pertence a QUALQUER gerente ativo.
    // Ou melhor: buscar o gerente pelo e-mail se fornecido, ou validar a senha do próprio usuário se ele for gerente.
    
    db.all("SELECT password_hash, name, id FROM users WHERE role IN ('manager', 'admin') AND is_active = 1", [], async (errAll, managers) => {
      let authorized = false;
      let authorizedBy = null;

      for (const m of managers) {
        if (await bcrypt.compare(password, m.password_hash)) {
          authorized = true;
          authorizedBy = m;
          break;
        }
      }

      if (!authorized) {
        createAuditLog("TENTATIVA_APROVACAO_FALHA", { action, reason }, req.user.id, 'security', 'high');
        return res.status(403).json({ message: "Senha de gerente inválida." });
      }

      const token = jwt.sign({ action, approved_by: authorizedBy.id, timestamp: Date.now() }, JWT_SECRET, { expiresIn: '5m' });
      createAuditLog("APROVACAO_CONCEDIDA", { action, reason, approved_by: authorizedBy.name }, req.user.id, 'security', 'medium');
      res.json({ token });
    });
  });
});

module.exports = { router };
