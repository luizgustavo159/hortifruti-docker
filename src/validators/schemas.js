const { z } = require('zod');

// ============ AUTH SCHEMAS ============
const loginSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase(),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
});

const registerSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres').max(100),
  email: z.string().email('Email inválido').toLowerCase(),
  password: z.string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter uma letra maiúscula')
    .regex(/[0-9]/, 'Senha deve conter um número')
    .regex(/[!@#$%^&*]/, 'Senha deve conter um caractere especial'),
  role: z.enum(['operator', 'supervisor', 'manager', 'admin']).default('operator'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token é obrigatório'),
});

// ============ PRODUCT SCHEMAS ============
const productSchema = z.object({
  name: z.string().min(1, 'Nome do produto é obrigatório').max(100),
  sku: z.string().min(1, 'SKU é obrigatório'),
  unit_type: z.string().default('un'),
  price: z.coerce.number().min(0, 'Preço não pode ser negativo'),
  category_id: z.preprocess((val) => (val === "" ? null : val), z.coerce.number().positive().nullable()),
  supplier_id: z.preprocess((val) => (val === "" ? null : val), z.coerce.number().positive().nullable()),
  min_stock: z.coerce.number().min(0).default(0),
  current_stock: z.coerce.number().min(0).default(0),
  avg_cost: z.coerce.number().min(0).default(0),
  profit_margin: z.preprocess((val) => (val === "" ? null : val), z.coerce.number().nullable()),
  image_url: z.string().nullable().optional(),
});

const productUpdateSchema = productSchema.partial();

// ============ SALE SCHEMAS ============
const saleItemSchema = z.object({
  product_id: z.number().positive('ID do produto é obrigatório'),
  quantity: z.number().positive('Quantidade deve ser positiva'),
  price: z.number().positive('Preço deve ser positivo'),
  discount_id: z.number().positive().optional().nullable(),
});

const saleSchema = z.object({
  items: z.array(saleItemSchema).min(1, 'Venda deve ter no mínimo 1 item'),
  payment_method: z.enum(['cash', 'pix', 'card', 'fiado']),
  customer_id: z.number().positive().nullable().optional(),
  manual_discount: z.coerce.number().min(0).default(0),
  amount_received: z.coerce.number().min(0).default(0),
  change_amount: z.coerce.number().min(0).default(0),
  notes: z.string().optional().default(''),
});

// ============ DISCOUNT SCHEMAS ============
const discountSchema = z.object({
  name: z.string().min(1, 'Nome do desconto é obrigatório').max(100),
  type: z.enum(['percentage', 'fixed', 'combo']),
  value: z.number().positive('Valor deve ser positivo'),
  description: z.string().optional().default(''),
  active: z.boolean().default(true),
  min_amount: z.number().min(0).optional(),
  max_uses: z.number().int().positive().optional(),
});

const discountUpdateSchema = discountSchema.partial();

// ============ USER SCHEMAS ============
const userSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres').max(100),
  email: z.string().email('Email inválido').toLowerCase(),
  password: z.string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter uma letra maiúscula')
    .regex(/[0-9]/, 'Senha deve conter um número'),
  role: z.enum(['operator', 'supervisor', 'manager', 'admin']),
  active: z.boolean().default(true),
});

const userUpdateSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  email: z.string().email().toLowerCase().optional(),
  role: z.enum(['operator', 'supervisor', 'manager', 'admin']).optional(),
  active: z.boolean().optional(),
});

// ============ PAGINATION SCHEMAS ============
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

// ============ CASH MOVEMENT SCHEMAS ============
const cashMovementSchema = z.object({
  type: z.enum(['opening', 'closing', 'withdrawal', 'deposit']),
  amount: z.number().positive('Valor deve ser positivo'),
  description: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

// ============ STOCK MOVEMENT SCHEMAS ============
const stockMovementSchema = z.object({
  product_id: z.number().positive('ID do produto é obrigatório'),
  type: z.enum(['adjustment', 'loss', 'transfer', 'return']),
  quantity: z.number().int().positive('Quantidade deve ser positiva'),
  reason: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

// ============ CATEGORY SCHEMAS ============
const categorySchema = z.object({
  name: z.string().min(1, 'Nome da categoria é obrigatório').max(100),
  description: z.string().optional().default(''),
  active: z.boolean().default(true),
});

const categoryUpdateSchema = categorySchema.partial();

// ============ CUSTOMER SCHEMAS ============
const customerSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres').max(100),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  credit_limit: z.coerce.number().min(0).default(500),
});

const customerUpdateSchema = customerSchema.partial();

// ============ VALIDATION HELPER ============
const validate = (schema) => {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.body);
      req.validated = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
};

const validateQuery = (schema) => {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.query);
      req.validatedQuery = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Query validation failed',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
};

module.exports = {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  productSchema,
  productUpdateSchema,
  saleItemSchema,
  saleSchema,
  discountSchema,
  discountUpdateSchema,
  userSchema,
  userUpdateSchema,
  paginationSchema,
  cashMovementSchema,
  stockMovementSchema,
  categorySchema,
  categoryUpdateSchema,
  customerSchema,
  customerUpdateSchema,
  validate,
  validateQuery
};
