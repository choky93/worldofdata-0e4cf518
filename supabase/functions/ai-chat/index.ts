import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MAX_CONTEXT_CHARS = 30000; // truncate extracted data if too large

// ── Fetch full company context including raw extracted data ──────
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

  // Extracted data — fetch FULL json, not just summaries
  const { data: extracted } = await sb
    .from("file_extracted_data")
    .select("data_category, summary, row_count, extracted_json, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(8);

  // Failed file uploads
  const { data: failedFiles } = await sb
    .from("file_uploads")
    .select("file_name, file_type, processing_error, created_at")
    .eq("company_id", companyId)
    .eq("status", "error")
    .order("created_at", { ascending: false })
    .limit(10);

  if (failedFiles?.length) {
    parts.push("\n=== ARCHIVOS CON ERROR DE PROCESAMIENTO ===");
    for (const f of failedFiles) {
      parts.push(`- "${f.file_name}" (${f.file_type}): ${f.processing_error || "sin detalle"}`);
    }
  }

  if (extracted?.length) {
    parts.push(`\n=== DATOS REALES EXTRAÍDOS DE LOS ARCHIVOS DEL NEGOCIO ===`);
    let totalChars = 0;
    for (const e of extracted) {
      const header = `\n## ${e.data_category.toUpperCase()} (${e.row_count || 0} registros)`;
      const summary = e.summary ? `Resumen: ${e.summary}` : "";
      let dataStr = "";
      try {
        dataStr = JSON.stringify(e.extracted_json, null, 0);
        // Truncate individual dataset if too large
        if (dataStr.length > 8000) {
          dataStr = dataStr.slice(0, 8000) + "... [datos truncados]";
        }
      } catch { dataStr = "[error parseando datos]"; }

      const block = `${header}\n${summary}\nDatos:\n${dataStr}`;
      if (totalChars + block.length > MAX_CONTEXT_CHARS) {
        parts.push("\n[... más datos disponibles pero truncados por límite de contexto]");
        break;
      }
      parts.push(block);
      totalChars += block.length;
    }
  }

  return parts.join("\n");
}

// ── Detect if the question needs external market context ────────
function needsMarketContext(userMessage: string): boolean {
  const keywords = [
    "mercado", "competencia", "tendencia", "industria", "sector",
    "argentina", "macro", "economía", "inflación", "importación",
    "exportación", "tipo de cambio", "dólar", "contexto",
    "proyección", "pronóstico", "benchmark", "promedio del sector",
    "otras empresas", "la competencia", "crecimiento del mercado"
  ];
  const lower = userMessage.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

// ── Fetch Perplexity market context ─────────────────────────────
async function fetchMarketContext(query: string, industry: string): Promise<string> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  if (!PERPLEXITY_API_KEY) return "";

  try {
    const resp = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: `Sos un analista de mercado. Respondé en español, de forma breve y con datos concretos. Industria del usuario: ${industry || "no especificada"}. País: Argentina. Dá cifras, porcentajes y tendencias actuales. Máximo 200 palabras.`,
          },
          { role: "user", content: query },
        ],
        search_recency_filter: "month",
      }),
    });

    if (!resp.ok) return "";
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "";
    const citations = data.citations || [];
    let result = content;
    if (citations.length) {
      result += `\nFuentes: ${citations.slice(0, 3).join(", ")}`;
    }
    return result;
  } catch (e) {
    console.error("Perplexity market context error:", e);
    return "";
  }
}

// ── System prompt ───────────────────────────────────────────────
function buildSystemPrompt(businessContext: string, marketContext: string, context?: Record<string, any>): string {
  const companyName = context?.companyName;
  return [
    `Sos un analista de datos senior que trabaja DENTRO de la empresa${companyName ? ` "${companyName}"` : ""}. Sos parte del equipo. Conocés el negocio de adentro.`,
    "",
    `El usuario está mirando actualmente: ${context?.currentPeriodLabel || "todo el historial disponible"}. Cuando respondas sobre datos del negocio, priorizá ese período salvo que te pregunten específicamente por otro.`,
    "",
    "## TU ROL",
    "- Sos un colega experto que analiza datos y da respuestas directas, NO un asistente genérico.",
    "- Tenés acceso completo a los datos del negocio (ventas, stock, gastos, clientes, etc.).",
    "- Tu trabajo es ANALIZAR y DAR RESPUESTAS, no decirle al usuario qué debería analizar.",
    "",
    "## REGLAS ESTRICTAS",
    "1. **NUNCA** hagas listas de pasos o cosas para revisar. Vos ya las revisaste. Dá la conclusión.",
    "2. **SIEMPRE** usá números concretos de los datos que tenés: cifras, porcentajes, nombres de productos, montos.",
    "3. **EMPEZÁ** con la respuesta/conclusión directa. Después explicá brevemente por qué.",
    "4. **SUGERÍ** acciones concretas y específicas, no genéricas.",
    "5. Si no tenés datos suficientes, decilo honestamente pero dá tu mejor hipótesis con lo que sí tenés.",
    "6. **MÁXIMO** 3-4 párrafos por respuesta. Sé conciso.",
    "7. Usá tono conversacional argentino (vos/tuteo). Hablá como un compañero de trabajo, no como un manual.",
    "8. Cuando des sugerencias, sé específico: no digas 'revisá el marketing', decí 'probá aumentar un 15% el presupuesto de Meta Ads en la categoría X que tiene mejor ROAS'.",
    "",
    "## FORMATO",
    "- Respuestas cortas y directas",
    "- Podés usar **negrita** para destacar datos clave",
    "- Evitá listas numeradas largas (máximo 3 items si es necesario)",
    "- No uses encabezados formales (##) ni estructuras de informe",
    "",
    businessContext ? `\n## DATOS DEL NEGOCIO (usá estos datos para responder)\n${businessContext}` : "",
    marketContext ? `\n## CONTEXTO DE MERCADO ACTUAL\n${marketContext}` : "",
  ].filter(Boolean).join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { messages, context, mode } = await req.json();

    // Mode: search → delegate to Perplexity
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

    // Mode: chat (default)
    let businessContext = "";
    let industry = "";
    if (context?.companyId) {
      try {
        businessContext = await fetchCompanyContext(context.companyId);
      } catch (e) {
        console.error("Error fetching company context:", e);
      }
      industry = context?.industry || "";
    }

    // Check if we need market context from Perplexity
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
    const userQuery = lastUserMsg?.content || "";
    let marketContext = "";
    if (needsMarketContext(userQuery)) {
      try {
        marketContext = await fetchMarketContext(userQuery, industry);
      } catch (e) {
        console.error("Error fetching market context:", e);
      }
    }

    const systemContent = buildSystemPrompt(businessContext, marketContext, context);

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
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
