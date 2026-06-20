import { NextResponse } from "next/server";
// TODO: import { prisma } from "@/lib/prisma";

// GET /api/items — replace with your domain logic
export async function GET() {
  return NextResponse.json([]);
}

// POST /api/items — replace with your domain logic
export async function POST(request: Request) {
  const body = await request.json();
  console.log(body);
  return NextResponse.json({}, { status: 201 });
}
