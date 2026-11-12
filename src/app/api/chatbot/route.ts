import { NextResponse } from "next/server";
import { chatbotReply } from "@/lib/booking-engine";
import { handleRouteError } from "@/lib/http";
import { requireSession } from "@/lib/session";

type ChatTurn = { role: "user" | "bot"; text: string };

async function runModelAnswer(args: {
  role: "ADMIN" | "EMPLOYEE";
  message: string;
  history: ChatTurn[];
  fallbackAnswer: string;
}): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const model = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

  const systemPrompt =
    "You are a production meeting operations assistant. Reply in clear plain English, keep answers practical and concise, and do not invent platform capabilities.";

  const messages = [
    { role: "system", content: systemPrompt },
    {
      role: "system",
      content: `User role: ${args.role}. Use this factual fallback context when needed: ${args.fallbackAnswer}`,
    },
    ...args.history.slice(-10).map((turn) => ({
      role: turn.role === "bot" ? "assistant" : "user",
      content: turn.text,
    })),
    { role: "user", content: args.message },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 420,
      messages,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const answer = payload.choices?.[0]?.message?.content?.trim();
  return answer && answer.length > 0 ? answer : null;
}

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    const body = (await request.json()) as {
      message?: string;
      history?: ChatTurn[];
    };

    if (!body.message || !body.message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const fallback = await chatbotReply(session.id, body.message, body.history ?? []);
    const modelAnswer = await runModelAnswer({
      role: session.role,
      message: body.message,
      history: body.history ?? [],
      fallbackAnswer: fallback.answer,
    });

    return NextResponse.json({
      ...fallback,
      answer: modelAnswer ?? fallback.answer,
      confidence: modelAnswer ? Math.max(0.9, fallback.confidence) : fallback.confidence,
      engine: modelAnswer ? "hybrid" : "rule-based",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
