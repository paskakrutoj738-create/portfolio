/**
 * Cloudflare Worker: приём заявок с сайта и отправка в Telegram.
 *
 * Переменные окружения (Settings → Variables and Secrets в Cloudflare):
 *   BOT_TOKEN      — токен бота от @BotFather (обязательно, secret)
 *   CHAT_ID        — ID чата/канала, куда присылать заявки (обязательно)
 *   ALLOWED_ORIGIN — домен(ы) сайта через запятую. По умолчанию "*".
 *                    Пример: "https://kuznetsov.works,https://www.kuznetsov.works"
 *
 * Токен бота хранится только здесь, в коде сайта его нет.
 */

const TYPE_LABELS = {
  railings: "Перила и ограждения",
  stairs: "Лестница",
  furniture: "Мебель на заказ",
  gates: "Ворота и калитка",
  other: "Другое",
};

const MAX_BODY_BYTES = 8000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 5;
const rateBuckets = new Map();

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (char) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char];
  });
}

function cleanText(value, maxLength) {
  return String(value == null ? "" : value)
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (rateBuckets.get(ip) || []).filter(function (time) {
    return now - time < RATE_WINDOW_MS;
  });

  if (recent.length >= RATE_LIMIT) {
    rateBuckets.set(ip, recent);
    return true;
  }

  recent.push(now);
  rateBuckets.set(ip, recent);

  // Не даём Map расти бесконечно в долгоживущем изоляте.
  if (rateBuckets.size > 1000) {
    rateBuckets.forEach(function (times, key) {
      if (!times.some(function (time) { return now - time < RATE_WINDOW_MS; })) {
        rateBuckets.delete(key);
      }
    });
  }

  return false;
}

export default {
  async fetch(request, env) {
    const requestOrigin = request.headers.get("Origin") || "";
    const allowedOrigins = (env.ALLOWED_ORIGIN || "*")
      .split(",")
      .map(function (item) { return item.trim(); })
      .filter(Boolean);

    const originAllowed =
      allowedOrigins.includes("*") ||
      !requestOrigin ||
      allowedOrigins.includes(requestOrigin);

    const cors = {
      "Access-Control-Allow-Origin": originAllowed
        ? (allowedOrigins.includes("*") ? "*" : requestOrigin)
        : (allowedOrigins[0] || "https://example.com"),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };

    const headers = {
      ...cors,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    };

    const reply = function (data, status) {
      return new Response(JSON.stringify(data), {
        status: status || 200,
        headers,
      });
    };

    if (!originAllowed) {
      return reply({ ok: false, error: "Origin is not allowed" }, 403);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (request.method === "GET") {
      return reply({ ok: true, service: "portfolio-form" });
    }

    if (request.method !== "POST") {
      return reply({ ok: false, error: "Method not allowed" }, 405);
    }

    if (!env.BOT_TOKEN || !env.CHAT_ID) {
      console.error("BOT_TOKEN or CHAT_ID is not configured");
      return reply({ ok: false, error: "Worker is not configured" }, 500);
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
      return reply({ ok: false, error: "Expected JSON" }, 415);
    }

    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    if (isRateLimited(clientIp)) {
      return reply({ ok: false, error: "Too many requests" }, 429);
    }

    let raw;
    try {
      raw = await request.text();
    } catch (error) {
      return reply({ ok: false, error: "Cannot read body" }, 400);
    }

    if (raw.length > MAX_BODY_BYTES) {
      return reply({ ok: false, error: "Payload too large" }, 413);
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      return reply({ ok: false, error: "Invalid JSON" }, 400);
    }

    if (!data || typeof data !== "object") {
      return reply({ ok: false, error: "Invalid payload" }, 400);
    }

    // Скрытое поле-ловушка: боты его заполняют.
    if (cleanText(data.company, 40)) {
      return reply({ ok: true });
    }

    const name = cleanText(data.name, 80);
    const contact = cleanText(data.contact, 120);
    const type = cleanText(data.type, 40);
    const message = cleanText(data.message, 1800);
    const page = cleanText(data.page, 300);
    const consent = data.consent === true || data.consent === "on";

    if (!name || !contact || !type) {
      return reply({ ok: false, error: "Заполните имя, контакт и направление" }, 422);
    }

    if (!consent) {
      return reply({ ok: false, error: "Нужно согласие на обработку данных" }, 422);
    }

    const typeLabel = TYPE_LABELS[type] || "Другое";
    const time = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

    const lines = [
      "<b>Новая заявка с сайта</b>",
      "",
      "<b>Имя:</b> " + escapeHtml(name),
      "<b>Контакт:</b> " + escapeHtml(contact),
      "<b>Направление:</b> " + escapeHtml(typeLabel),
    ];

    if (message) {
      lines.push("<b>Сообщение:</b>", escapeHtml(message));
    }

    lines.push("", "<i>Время: " + escapeHtml(time) + "</i>");

    if (page) {
      lines.push("<i>Страница: " + escapeHtml(page) + "</i>");
    }

    let telegramResponse;
    try {
      telegramResponse = await fetch(
        "https://api.telegram.org/bot" + env.BOT_TOKEN + "/sendMessage",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: env.CHAT_ID,
            text: lines.join("\n"),
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        }
      );
    } catch (error) {
      console.error("Telegram request failed", error);
      return reply({ ok: false, error: "Не удалось отправить заявку" }, 502);
    }

    const telegramResult = await telegramResponse.json().catch(function () {
      return {};
    });

    if (!telegramResponse.ok || !telegramResult.ok) {
      console.error(
        "Telegram API error:",
        telegramResponse.status,
        telegramResult.description || "unknown error"
      );
      return reply({ ok: false, error: "Не удалось отправить заявку" }, 502);
    }

    return reply({ ok: true });
  },
};
