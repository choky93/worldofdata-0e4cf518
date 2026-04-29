-- Ola 17: Borrado de archivos controlado por admin
--
-- Lucas pidió que solo el admin pueda borrar archivos. Si un employee
-- quiere borrar uno, debe solicitar autorización al admin con un motivo.
-- El admin recibe la solicitud, la revisa, aprueba o rechaza.
--
-- Implementación:
--   1) Tabla delete_requests para registrar las solicitudes pendientes.
--   2) Cambiamos la RLS DELETE de file_uploads: SOLO admin puede borrar.
--      (Antes: dueño del upload o admin → ahora solo admin.)
--   3) RLS en delete_requests: cualquier usuario de la company puede
--      crear; admin puede ver/aprobar/rechazar las propias.
--   4) Audit log: cuando admin aprueba o rechaza, lo logueamos.

-- ── 1) Tabla delete_requests ──────────────────────────────────
CREATE TABLE public.delete_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Archivo cuyo borrado se solicita (puede haber sido borrado entremedio
  -- por otra vía → ON DELETE SET NULL para no perder el historial).
  file_upload_id uuid REFERENCES public.file_uploads(id) ON DELETE SET NULL,
  -- Snapshot del nombre del archivo para preservar contexto.
  file_name text NOT NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  -- 'pending' | 'approved' | 'rejected'
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX idx_delete_requests_company ON public.delete_requests(company_id);
CREATE INDEX idx_delete_requests_status ON public.delete_requests(company_id, status);
CREATE INDEX idx_delete_requests_requester ON public.delete_requests(requested_by);

ALTER TABLE public.delete_requests ENABLE ROW LEVEL SECURITY;

-- Cualquier user de la company ve las requests (su propia + las pendientes).
CREATE POLICY "Users see own company delete_requests"
  ON public.delete_requests FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

-- Cualquier user puede crear una solicitud para su company.
CREATE POLICY "Users can create delete_requests"
  ON public.delete_requests FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_user_company_id()
    AND requested_by = auth.uid()
  );

-- Solo admin puede aprobar/rechazar (UPDATE).
CREATE POLICY "Admin can decide delete_requests"
  ON public.delete_requests FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id() AND public.has_role(auth.uid(), 'admin'));

-- Solo admin puede borrar registros del historial (limpieza).
CREATE POLICY "Admin can delete delete_requests"
  ON public.delete_requests FOR DELETE TO authenticated
  USING (company_id = get_user_company_id() AND public.has_role(auth.uid(), 'admin'));

-- ── 2) RLS DELETE de file_uploads: solo admin ─────────────────
DROP POLICY IF EXISTS "Admins can delete uploads" ON public.file_uploads;

CREATE POLICY "Only admins can delete file_uploads"
  ON public.file_uploads FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Comentario: los employees ya no pueden borrar directamente. La UI debe
-- ofrecerles "Solicitar borrado" que crea un row en delete_requests.
-- Cuando el admin aprueba, hace el DELETE real (esa parte va por la app,
-- no por la DB — la migración solo establece la policy).
