
-- Step 1: Create helper function
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_company_id FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_company_id TO authenticated;

-- Step 2: Fix profiles policies
DROP POLICY IF EXISTS "Admins can view company profiles" ON public.profiles;
CREATE POLICY "Admins can view company profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id() AND public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update company profiles" ON public.profiles;
CREATE POLICY "Admins can update company profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id() AND public.has_role(auth.uid(), 'admin'::app_role));

-- Step 3: Fix companies policies
DROP POLICY IF EXISTS "Users can view own company" ON public.companies;
CREATE POLICY "Users can view own company" ON public.companies
  FOR SELECT USING (id = public.get_user_company_id());

DROP POLICY IF EXISTS "Admins can update company" ON public.companies;
CREATE POLICY "Admins can update company" ON public.companies
  FOR UPDATE USING (id = public.get_user_company_id() AND public.has_role(auth.uid(), 'admin'::app_role));

-- Step 4: Fix company_settings policies
DROP POLICY IF EXISTS "Users can view own company settings" ON public.company_settings;
CREATE POLICY "Users can view own company settings" ON public.company_settings
  FOR SELECT USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "Admins can manage company settings" ON public.company_settings;
CREATE POLICY "Admins can manage company settings" ON public.company_settings
  FOR UPDATE USING (company_id = public.get_user_company_id() AND public.has_role(auth.uid(), 'admin'::app_role));

-- Step 5: Fix diagnostic_results policies
DROP POLICY IF EXISTS "Admins can manage diagnostic" ON public.diagnostic_results;
CREATE POLICY "Admins can manage diagnostic" ON public.diagnostic_results
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (company_id = public.get_user_company_id() AND public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view own diagnostic" ON public.diagnostic_results;
CREATE POLICY "Users can view own diagnostic" ON public.diagnostic_results
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

-- Step 6: Fix file_uploads policy
DROP POLICY IF EXISTS "Users can view own uploads" ON public.file_uploads;
CREATE POLICY "Users can view own uploads" ON public.file_uploads
  FOR SELECT USING (uploaded_by = auth.uid() OR (company_id = public.get_user_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)));
