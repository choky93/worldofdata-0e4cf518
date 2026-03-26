import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function fetchCompanyContext(companyId: string): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  const parts: string[] = [];

  // Company info
  const { data: company } = await sb.from("companies").select("name, industry, employee_count, years_operating").eq("id", companyId).single();
  if (company) {
    parts.push(`Empresa: ${company.name || "(sin nombre)"}. Industria: ${company.industry || "no especificada"}. Empleados: ${company.employee_count || "?"}. Años operando: ${company.years_operating || "?"}.`);
  }

  // Company settings
  const { data: settings } = await sb.from("company_settings").select("*").eq("company_id", companyId).single();
  if (settings) {
    const flags: string[] = [];
    if (settings.sells_products) flags.push("vende productos");
    if (settings.sells_services) flags.push("vende servicios");
    if (settings.has_stock) flags.push("maneja stock");
    if (settings.has_logistics) flags.push("tiene logística");
    if (settings.uses_meta_ads) flags.push("usa Meta Ads");
    if (settings.uses_google_ads) flags.push("usa Google Ads");
    if (settings.has_recurring_clients) flags.push("tiene clientes recurrentes");
    if (settings.has_wholesale_prices) flags.push("tiene precios mayoristas");
    if (settings.crm_erp) flags.push(`usa CRM/ERP: ${settings.crm_erp}`);
    if (settings.goals?.length) flags.push(`objetivos: ${settings.goals.join(", ")}`);
    if (flags.length) parts.push(`Configuración: ${flags.join("; ")}.`);
  }

  // Diagnostic
  const { data: diag } = await sb.from("diagnostic_results").select("maturity_classification, pain_point, priority_indicators, potential_improvement_pct").eq("company_id", companyId).single();
  if (diag) {
    parts.push(`Diagnóstico: madurez ${diag.maturity_classification || "?"}, dolor principal: ${diag.pain_point || "?"}, mejora potencial: ${diag.potential_improvement_pct || 0}%, indicadores prioritarios: ${diag.priority_indicators?.join(", ") || "ninguno"}.`);
  }

  // Recent uploads
  const { data: uploads } = await sb.from("file_uploads").select("file_name, file_type, created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(10);
  if (uploads?.length) {
    parts.push(`Archivos recientes: ${uploads.map(u => `${u.file_name} (${u.file_type || "?"})`).join(", ")}.`);
  }

  return parts.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { messages, context, mode } = await req.json();

    // Mode: search → delegate to Perplexity via ai-search
    if (mode === "search") {
      const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
      if (!PERPLEXITY_API_KEY) {
        return new Response(JSON.stringify({ error: "PERPLEXITY_API_KEY not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
      const query = lastUserMsg?.content || "";

      const systemContent = context
        ? `Sos un analista de mercado e industria. Contexto del negocio del usuario: ${context}. Respondé en español con datos actualizados y fuentes.`
        : "Sos un analista de mercado e industria. Respondé en español con datos actualizados y fuentes.";

      const pResp = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar-pro",
          messages: [
            { role: "system", content: systemContent },
            { role: "user", content: query },
          ],
        }),
      });

      if (!pResp.ok) {
        const errBody = await pResp.text();
        return new Response(JSON.stringify({ error: `Search error [${pResp.status}]: ${errBody}` }), {
          status: pResp.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pData = await pResp.json();
      const result = {
        content: pData.choices?.[0]?.message?.content || "",
        citations: pData.citations || [],
      };
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mode: chat (default) — use Lovable AI Gateway with streaming
    let businessContext = "";
    if (context?.companyId) {
      try {
        businessContext = await fetchCompanyContext(context.companyId);
      } catch (e) {
        console.error("Error fetching company context:", e);
      }
    }

    const systemContent = [
      "Sos un asistente de negocios experto en datos, finanzas y operaciones para PyMEs latinoamericanas. Respondé en español, de forma clara y accionable.",
      businessContext ? `\n\nDatos del negocio del usuario:\n${businessContext}` : "",
      context?.companyName ? `\nNombre de la empresa: ${context.companyName}` : "",
    ].join("");

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemContent },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Demasiadas consultas. Esperá un momento e intentá de nuevo." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA agotados. Contactá al administrador." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: `AI gateway error [${response.status}]` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("ai-chat error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
