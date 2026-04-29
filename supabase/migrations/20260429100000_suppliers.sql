-- Ola 15: Manager de proveedores (MVP)
--
-- Lucas pidió poder cargar proveedores con su tiempo de entrega prometido
-- vs. real, para que el cálculo de alertas de stock deje de usar el
-- hardcoded de 20 días y se base en el lead time real de cada proveedor.
--
-- MVP en esta migración:
--   - suppliers: datos básicos del proveedor + lead times.
--   - supplier_products: qué productos vende cada proveedor (por nombre/SKU).
--   - supplier_deliveries: registro de entregas para calcular lead time real.
--
-- RLS: por company_id, igual al resto del sistema.

-- ── 1) suppliers ──────────────────────────────────────────────
CREATE TABLE public.suppliers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  cuit text,
  contact_person text,
  -- Tiempo de entrega que el proveedor promete (default), en días.
  -- El "real" se calcula desde supplier_deliveries.
  lead_time_promised_days integer,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppliers_company ON public.suppliers(company_id);
CREATE INDEX idx_suppliers_active ON public.suppliers(company_id, active);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company suppliers"
  ON public.suppliers FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can insert own company suppliers"
  ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Users can update own company suppliers"
  ON public.suppliers FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can delete own company suppliers"
  ON public.suppliers FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());

-- ── 2) supplier_products ──────────────────────────────────────
CREATE TABLE public.supplier_products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Nombre tal como aparece en nuestro stock (matching por nombre normalizado).
  product_name text NOT NULL,
  -- SKU del PROVEEDOR (puede diferir del nuestro).
  supplier_sku text,
  -- Override por-producto del lead time (si difiere del default del proveedor).
  lead_time_override_days integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(supplier_id, product_name)
);

CREATE INDEX idx_supplier_products_supplier ON public.supplier_products(supplier_id);
CREATE INDEX idx_supplier_products_company ON public.supplier_products(company_id);
-- Para joinear con stock: nombre normalizado lower-trim por compañía.
CREATE INDEX idx_supplier_products_name ON public.supplier_products(company_id, lower(product_name));

ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company supplier_products"
  ON public.supplier_products FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can insert own company supplier_products"
  ON public.supplier_products FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Users can update own company supplier_products"
  ON public.supplier_products FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can delete own company supplier_products"
  ON public.supplier_products FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());

-- ── 3) supplier_deliveries ────────────────────────────────────
CREATE TABLE public.supplier_deliveries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Cuándo se hizo el pedido / cuándo prometió / cuándo llegó.
  ordered_at date NOT NULL,
  promised_at date,
  received_at date,
  -- 'pending' | 'received' | 'cancelled' | 'partial'
  status text NOT NULL DEFAULT 'pending',
  -- Quantity pedida (opcional, para futuras alertas de cantidad).
  quantity numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('pending', 'received', 'cancelled', 'partial'))
);

CREATE INDEX idx_supplier_deliveries_supplier ON public.supplier_deliveries(supplier_id);
CREATE INDEX idx_supplier_deliveries_company ON public.supplier_deliveries(company_id);
CREATE INDEX idx_supplier_deliveries_status ON public.supplier_deliveries(company_id, status);

ALTER TABLE public.supplier_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company supplier_deliveries"
  ON public.supplier_deliveries FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can insert own company supplier_deliveries"
  ON public.supplier_deliveries FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Users can update own company supplier_deliveries"
  ON public.supplier_deliveries FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can delete own company supplier_deliveries"
  ON public.supplier_deliveries FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());

-- ── 4) Trigger para updated_at en suppliers ───────────────────
CREATE OR REPLACE FUNCTION public.update_suppliers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_suppliers_updated_at();
