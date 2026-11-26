import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_STAGES = new Set(["queued", "reviewing", "in_progress", "feedback", "done"]);
const pad = (n: number) => "#" + String(n || 0).padStart(3, "0");

async function callLLM(system: string, messages: { role: string; content: string }[]) {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (openaiKey) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, ...messages],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "{}";
  }

  if (geminiKey) {
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  }

  if (anthropicKey) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") || "claude-3-5-sonnet-latest",
        max_tokens: 1500,
        system,
        messages: messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
      }),
    });
    if (!res.ok) throw new Error(`Anthropic error: ${await res.text()}`);
    const data = await res.json();
    return data.content?.[0]?.text || "{}";
  }

  throw new Error("Missing AI API key secret (OPENAI_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY).");
}

function parseJson(raw: string) {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userSb = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userSb.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

    const { workspace_id, messages } = await req.json();
    if (!workspace_id || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "invalid_payload" }), { status: 400, headers: cors });
    }

    const admin = createClient(url, serviceKey);
    const { data: ws } = await admin.from("workspaces").select("id,owner_id,name,status").eq("id", workspace_id).maybeSingle();
    if (!ws || ws.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });
    }

    // Load full workspace context across all clients
    const [clRes, qRes, reqRes, ckRes, noteRes, msgRes] = await Promise.all([
      admin.from("clients").select("id,display_name,stage,status_note,created_at").eq("workspace_id", workspace_id).order("created_at"),
      admin.from("queue_entries").select("client_id,ticket_no,state,sort_key").eq("workspace_id", workspace_id),
      admin.from("requirements").select("client_id,body").eq("workspace_id", workspace_id).order("position"),
      admin.from("checklist_items").select("client_id,text,done").eq("workspace_id", workspace_id).order("created_at"),
      admin.from("notes").select("client_id,body,visibility,pinned").eq("workspace_id", workspace_id),
      admin.from("messages").select("client_id,sender_kind,body,created_at").eq("workspace_id", workspace_id).order("created_at", { ascending: false }).limit(250),
    ]);

    const clients = clRes.data || [];
    const clientMap = new Map(clients.map((c) => [c.id, c]));
    const qMap = new Map((qRes.data || []).map((q) => [q.client_id, q]));

    const contextBlocks = clients.map((c) => {
      const q = qMap.get(c.id);
      const reqs = (reqRes.data || []).filter((x) => x.client_id === c.id).map((x) => `- ${x.body}`);
      const tasks = (ckRes.data || []).filter((x) => x.client_id === c.id).map((x) => `[${x.done ? "x" : " "}] ${x.text}`);
      const notes = (noteRes.data || []).filter((x) => x.client_id === c.id).map((x) => `- (${x.visibility}${x.pinned ? ", pinned" : ""}) ${x.body}`);
      const msgs = (msgRes.data || [])
        .filter((x) => x.client_id === c.id)
        .slice(0, 18)
        .reverse()
        .map((x) => `  ${x.sender_kind}: ${x.body}`);

      return [
        `CLIENT: ${c.display_name} | client_id=${c.id} | ticket=${pad(q?.ticket_no || 0)} | queue_state=${q?.state || "waiting"} | stage=${c.stage}${c.status_note ? ` | status_note="${c.status_note}"` : ""}`,
        reqs.length ? `  Wish list:\n  ${reqs.join("\n  ")}` : "  Wish list: (none)",
        tasks.length ? `  Checklist:\n  ${tasks.join("\n  ")}` : "  Checklist: (none)",
        notes.length ? `  Notes:\n  ${notes.join("\n  ")}` : "",
        msgs.length ? `  Recent messages (oldest->newest):\n${msgs.join("\n")}` : "  Recent messages: (none)",
      ].filter(Boolean).join("\n");
    });

    const systemPrompt = `You are Elara, the freelance developer's JARVIS-style studio assistant for "${ws.name}" (workspace status: ${ws.status}).
You have full context on every client below—including their wish list, checklist, notes, and chat history.

When the developer gives a command (even across multiple clients at once):
1. Match the right client(s) by name using the context below.
2. When drafting a message referencing past conversations (e.g. "assets we talked about"), use the specific items mentioned in that client's chat history, wish list, or notes!
3. Return ONLY valid JSON matching this exact shape:
{
  "reply": "Concise, helpful response to the developer summarizing what you found or prepared.",
  "actions": [
    { "client_id": "uuid", "type": "set_stage", "stage": "queued|reviewing|in_progress|feedback|done" },
    { "client_id": "uuid", "type": "draft_message", "body": "Message ready to send to the client" },
    { "client_id": "uuid", "type": "add_task", "text": "New checklist item text" }
  ]
}

Rules:
- Only use valid client_id UUIDs from the context below.
- Only include actions the developer asked for or clearly implied (otherwise return "actions": []).
- Write client messages in a warm, natural freelance developer voice—never robotic.

WORKSPACE CLIENTS:
${contextBlocks.join("\n\n") || "(No clients in workspace yet)"}`;

    const raw = await callLLM(systemPrompt, messages.slice(-12));
    const parsed = parseJson(raw);

    const safeActions = (Array.isArray(parsed.actions) ? parsed.actions : [])
      .filter((a: any) => a && typeof a.client_id === "string" && clientMap.has(a.client_id))
      .map((a: any) => {
        const cl = clientMap.get(a.client_id)!;
        const q = qMap.get(a.client_id);
        const base = {
          client_id: a.client_id,
          client_name: cl.display_name,
          ticket: pad(q?.ticket_no || 0),
        };
        if (a.type === "set_stage" && VALID_STAGES.has(a.stage)) {
          return { ...base, type: "set_stage", stage: a.stage };
        }
        if (a.type === "draft_message" && typeof a.body === "string" && a.body.trim()) {
          return { ...base, type: "draft_message", body: a.body.trim() };
        }
        if (a.type === "add_task" && typeof a.text === "string" && a.text.trim()) {
          return { ...base, type: "add_task", text: a.text.trim() };
        }
        return null;
      })
      .filter(Boolean);

    return new Response(
      JSON.stringify({ reply: String(parsed.reply || ""), actions: safeActions }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});