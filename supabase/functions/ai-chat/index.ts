import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
// Ola 13: subimos el contexto para que el Copilot tenga más datos.
// 4000 era demasiado angosto y forzaba al modelo a decir "me faltan datos".
const MAX_CONTEXT_CHARS = 12000;

// ── Helpers ─────────────────────────────────────────────────────
function fmtARS(n: number): string {
  if (Math.abs(n) >= 1_000_000) return "$" + (n / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "M";
  if (Math.abs(n) >= 1_000) return "$" + (n / 1_000).toLocaleString("es-AR", { maximumFractionDigits: 0 }) + "k";
  return "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function shortMonth(dateStr: string): string {
  try {
    const d = new Date(dateStr + (dateStr.length <= 7 ? "-01" : ""));
    return d.toLocaleDateString("es-AR", { month: "short", year: "2-digit" }).replace(".", "");
  } catch { return dateStr; }
}

function findNumber(row: Record<string, unknown>, keywords: string[]): number | null {
  for (const [k, v] of Object.entries(row)) {
    const lk = k.toLowerCase();
    if (keywords.some(kw => lk.includes(kw))) {
      const n = Number(v);
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

function findDate(row: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(row)) {
    const lk = k.toLowerCase();
    if (lk.includes("fecha") || lk.includes("date") || lk.includes("mes") || lk.includes("periodo")) {
      if (typeof v === "string" && v.length >= 7) return v;
    }
  }
  return null;
}

// ── Summarize ventas ────────────────────────────────────────────
function summarizeSales(rows: Record<string, unknown>[]): string {
  const monthly = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const amt = findNumber(r, ["total", "monto", "venta", "importe", "ingreso", "revenue", "amount"]);
    if (amt == null) continue;
    total += amt;
    const date = findDate(r);
    const key = date ? date.slice(0, 7) : "sin-fecha";
    monthly.set(key, (monthly.get(key) || 0) + amt);
  }
  if (total === 0) return "VENTAS: Sin datos de montos.";

  const sorted = [...monthly.entries()].filter(([k]) => k !== "sin-fecha").sort((a, b) => a[0].localeCompare(b[0]));
  const best = sorted.reduce((a, b) => b[1] > a[1] ? b : a, sorted[0]);
  const worst = sorted.reduce((a, b) => b[1] < a[1] ? b : a, sorted[0]);
  const avg = sorted.length > 0 ? sorted.reduce((s, e) => s + e[1], 0) / sorted.length : 0;
  const last3 = sorted.slice(-3);
  const last3Avg = last3.length > 0 ? last3.reduce((s, e) => s + e[1], 0) / last3.length : 0;
  const trendPct = avg > 0 ? Math.round(((last3Avg - avg) / avg) * 100) : 0;
  const trend = trendPct >= 0 ? `por encima del promedio (+${trendPct}%)` : `por debajo del promedio (${trendPct}%)`;
  const last6 = sorted.slice(-6).reverse().map(([k, v]) => `${shortMonth(k)} ${fmtARS(v)}`).join(", ");
  const noDate = monthly.get("sin-fecha");

  let text = `VENTAS: Total histórico ${fmtARS(total)}. Mejor mes: ${shortMonth(best[0])} (${fmtARS(best[1])}). Peor mes: ${shortMonth(worst[0])} (${fmtARS(worst[1])}). Promedio mensual: ${fmtARS(avg)}. Tendencia últimos 3 meses: ${trend}.`;
  // Ola 13: incluimos la SERIE TEMPORAL COMPLETA mes a mes para que el modelo
  // pueda responder preguntas como "cuál fue el mejor mes" sin pedir datos extra.
  if (sorted.length > 0) {
    const fullSeries = sorted.map(([k, v]) => `${shortMonth(k)}=${fmtARS(v)}`).join(", ");
    text += ` Serie mensual completa (${sorted.length} meses): ${fullSeries}.`;
  } else if (last6) {
    text += ` Últimos 6 meses: ${last6}.`;
  }
  if (noDate) text += ` Ventas sin fecha asignada: ${fmtARS(noDate)}.`;
  return text;
}

// ── Summarize marketing ─────────────────────────────────────────
function summarizeMarketing(rows: Record<string, unknown>[]): string {
  let totalSpend = 0, totalConv = 0, roasSum = 0, roasCount = 0;
  let bestRoas: { name: string; val: number } | null = null;
  let worstRoas: { name: string; val: number } | null = null;
  const monthly = new Map<string, { spend: number; conv: number }>();

  for (const r of rows) {
    const spend = findNumber(r, ["gasto", "spend", "inversion", "inversión", "costo", "cost"]);
    const conv = findNumber(r, ["conversion", "conversiones"]);
    const roas = findNumber(r, ["roas", "retorno"]);
    const name = (r["campaña"] || r["campaign"] || r["nombre"] || r["canal"] || "") as string;

    if (spend != null) totalSpend += spend;
    if (conv != null) totalConv += conv;
    if (roas != null) {
      roasSum += roas;
      roasCount++;
      if (!bestRoas || roas > bestRoas.val) bestRoas = { name: name || "sin nombre", val: roas };
      if (!worstRoas || roas < worstRoas.val) worstRoas = { name: name || "sin nombre", val: roas };
    }
    // Ola 13: serie mensual de inversión publicitaria
    const date = findDate(r);
    if (date && spend != null) {
      const key = date.slice(0, 7);
      const m = monthly.get(key) || { spend: 0, conv: 0 };
      m.spend += spend;
      if (conv != null) m.conv += conv;
      monthly.set(key, m);
    }
  }
  if (totalSpend === 0 && totalConv === 0 && roasCount === 0) return "MARKETING: Sin datos de campañas.";

  const parts = [`MARKETING: Gasto total ${fmtARS(totalSpend)}.`];
  if (roasCount > 0) parts.push(`ROAS promedio: ${(roasSum / roasCount).toFixed(2)}.`);
  if (bestRoas) parts.push(`Mejor ROAS: "${bestRoas.name}" (${bestRoas.val.toFixed(2)}).`);
  if (worstRoas && worstRoas.name !== bestRoas?.name) parts.push(`Peor ROAS: "${worstRoas.name}" (${worstRoas.val.toFixed(2)}).`);
  if (totalConv > 0) parts.push(`Total conversiones: ${totalConv.toLocaleString("es-AR")}.`);
  if (monthly.size > 0) {
    const sortedMonths = [...monthly.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    parts.push(`Inversión por mes: ${sortedMonths.map(([k, v]) => `${shortMonth(k)}=${fmtARS(v.spend)}${v.conv ? ` (${v.conv} conv)` : ''}`).join(", ")}.`);
  }
  return parts.join(" ");
}

// ── Summarize gastos ────────────────────────────────────────────
function summarizeExpenses(rows: Record<string, unknown>[], salesTotal: number): string {
  let total = 0;
  for (const r of rows) {
    const amt = findNumber(r, ["total", "monto", "gasto", "importe", "amount", "costo", "cost"]);
    if (amt != null) total += amt;
  }
  if (total === 0) return "GASTOS: Sin datos de gastos.";
  let text = `GASTOS: Total del período ${fmtARS(total)}.`;
  if (salesTotal > 0) {
    const net = salesTotal - total;
    text += ` Resultado neto estimado: ${fmtARS(net)} (margen ${Math.round((net / salesTotal) * 100)}%).`;
  }
  return text;
}

// ── Summarize other categories ──────────────────────────────────
function summarizeOther(category: string, rows: Record<string, unknown>[], summary: string | null): string {
  const text = summary ? `${category.toUpperCase()}: ${summary} (${rows.length} registros).` : `${category.toUpperCase()}: ${rows.length} registros cargados.`;
  return text;
}

// ── Fetch full company context with pre-calculated summaries ────
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

  // Extracted data — fetch and summarize.
  // Ola 13: subimos el límite a 200 chunks. Antes (20) si el cliente subía
  // 30+ archivos mensuales, los más viejos se perdían y el modelo respondía
  // "no tengo datos suficientes" cuando en realidad sí los tenía cargados.
  const { data: extracted } = await sb
    .from("file_extracted_data")
    .select("data_category, summary, row_count, extracted_json, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(200);

  // Failed file uploads
  const { data: failedFiles } = await sb
    .from("file_uploads")
    .select("file_name, file_type, processing_error, created_at")
    .eq("company_id", companyId)
    .eq("status", "error")
    .order("created_at", { ascending: false })
    .limit(5);

  if (failedFiles?.length) {
    parts.push("ARCHIVOS CON ERROR: " + failedFiles.map(f => `"${f.file_name}": ${f.processing_error || "sin detalle"}`).join("; ") + ".");
  }

  if (extracted?.length) {
    // Group rows by category
    const byCategory = new Map<string, { rows: Record<string, unknown>[]; summary: string | null }>();
    for (const e of extracted) {
      const cat = e.data_category.toLowerCase();
      const existing = byCategory.get(cat) || { rows: [], summary: null };
      const json = e.extracted_json;
      const arr = Array.isArray(json) ? json : (json && typeof json === "object" && "rows" in (json as Record<string,unknown>)) ? (json as Record<string,unknown>).rows as Record<string,unknown>[] : [json as Record<string,unknown>];
      existing.rows.push(...arr);
      if (!existing.summary && e.summary) existing.summary = e.summary;
      byCategory.set(cat, existing);
    }

    let salesTotal = 0;

    // Ventas
    const ventas = byCategory.get("ventas");
    if (ventas) {
      const s = summarizeSales(ventas.rows);
      parts.push(s);
      // Extract total for net calc
      const match = s.match(/Total histórico \$([0-9.,]+[Mk]?)/);
      if (ventas.rows.length) {
        for (const r of ventas.rows) {
          const amt = findNumber(r, ["total", "monto", "venta", "importe", "ingreso", "revenue", "amount"]);
          if (amt != null) salesTotal += amt;
        }
      }
      byCategory.delete("ventas");
    }

    // Marketing
    const mkt = byCategory.get("marketing");
    if (mkt) {
      parts.push(summarizeMarketing(mkt.rows));
      byCategory.delete("marketing");
    }

    // Gastos
    const gastos = byCategory.get("gastos");
    if (gastos) {
      parts.push(summarizeExpenses(gastos.rows, salesTotal));
      byCategory.delete("gastos");
    }

    // Other categories
    for (const [cat, data] of byCategory) {
      parts.push(summarizeOther(cat, data.rows, data.summary));
    }
  }

  // Enforce max context size
  let result = parts.join("\n");
  if (result.length > MAX_CONTEXT_CHARS) {
    result = result.slice(0, MAX_CONTEXT_CHARS - 30) + "\n[contexto truncado por límite]";
  }
  return result;
}

// ── Detect if the question needs external market/macro context ───
const MARKET_KEYWORDS = [
  "mercado", "competencia", "tendencia", "industria", "sector",
  "argentina", "macro", "economía", "inflación", "importación",
  "exportación", "tipo de cambio", "dólar", "contexto",
  "proyección", "pronóstico", "benchmark", "promedio del sector",
  "otras empresas", "la competencia", "crecimiento del mercado",
  "forecast", "próximo mes", "mes que viene", "trimestre",
  "fin de año", "voy a vender", "voy a ganar", "cuánto voy a",
  "estimado", "caja a fin",
];

const FORECAST_KEYWORDS = [
  "forecast", "pronóstico", "próximo mes", "mes que viene",
  "trimestre", "fin de año", "voy a vender", "voy a ganar",
  "cuánto voy a", "proyección", "estimado", "caja a fin",
];

function needsMarketContext(userMessage: string): boolean {
  const lower = userMessage.toLowerCase();
  return MARKET_KEYWORDS.some(k => lower.includes(k));
}

function isForecastQuery(userMessage: string): boolean {
  const lower = userMessage.toLowerCase();
  return FORECAST_KEYWORDS.some(k => lower.includes(k));
}

// ── Fetch Perplexity market context ─────────────────────────────
async function fetchMarketContext(query: string, industry: string, isForecast: boolean): Promise<string> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  if (!PERPLEXITY_API_KEY) return "";

  const currentMonth = new Date().toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  const perplexityQuery = isForecast
    ? `Contexto económico Argentina ${currentMonth}: inflación mensual, tipo de cambio, consumo minorista, actividad PyMEs. Datos concretos y actuales.`
    : query;

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
          { role: "user", content: perplexityQuery },
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
  const liveSummary = context?.livePeriodSummary;
  const availableModules: string[] = context?.availableModules || [];
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
    "## REGLAS ESTRICTAS (en orden de importancia)",
    "1. **JAMÁS empieces pidiendo datos.** Tenés DATOS DEL NEGOCIO inyectados en este prompt. Usalos. Está prohibido empezar con 'me faltan datos', 'necesito X', 'no puedo responder sin Y' o similares. Si la pregunta requiere datos que no están, RESPONDÉ CON LO QUE SÍ TENÉS y al final mencioná en una línea qué ayudaría a refinar la respuesta.",
    "2. **EMPEZÁ con la respuesta/conclusión directa.** Después explicá brevemente por qué. Nunca devuelvas una checklist de pasos a seguir antes de dar tu hipótesis.",
    "3. **SIEMPRE usá números concretos** de los datos que tenés: cifras, porcentajes, nombres de productos/campañas, montos, meses específicos. Si tenés 'mejor mes Mar 25 ($X)', citalo textual.",
    "4. **NUNCA hagas listas de pasos** o cosas para revisar. Vos ya las revisaste. Dá la conclusión.",
    "5. **SUGERÍ acciones concretas y específicas**, no genéricas. No digas 'revisá el marketing', decí 'probá aumentar un 15% el presupuesto de Meta Ads en la campaña X que tiene mejor ROAS'.",
    "6. **MÁXIMO 3-4 párrafos** por respuesta. Sé conciso.",
    "7. Usá tono conversacional argentino (vos/tuteo). Hablá como un compañero de trabajo, no como un manual.",
    "8. Si literalmente NO hay ningún dato relevante en el contexto (ej: te preguntan por marketing pero la sección MARKETING dice 'Sin datos de campañas'), explicá qué módulo cargar y qué responderías cuando esté. Pero esto es la excepción, no la regla.",
    "",
    "## FORMATO",
    "- Respuestas cortas y directas",
    "- Podés usar **negrita** para destacar datos clave",
    "- Evitá listas numeradas largas (máximo 3 items si es necesario)",
    "- No uses encabezados formales (##) ni estructuras de informe",
    "",
    businessContext ? `\n## DATOS DEL NEGOCIO (usá estos datos para responder)\n${businessContext}` : "",
    liveSummary ? `\n## KPIs DEL PERÍODO ACTIVO (calculados en tiempo real)\n${liveSummary}` : "",
    availableModules.length > 0 ? `\nMódulos con datos cargados: ${availableModules.join(", ")}.` : "",
    marketContext ? `\n## CONTEXTO MACROECONÓMICO ARGENTINO ACTUAL\nCuando hagas proyecciones, tené en cuenta el contexto macroeconómico argentino actual que se detalla abajo. Si hay inflación alta, mencioná que los números en pesos pueden estar distorsionados y sugerí mirar la tendencia en unidades o en porcentajes, no solo en pesos.\n${marketContext}` : "",
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
      const forecast = isForecastQuery(userQuery);
      try {
        marketContext = await fetchMarketContext(userQuery, industry, forecast);
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
