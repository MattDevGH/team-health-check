import { NextResponse } from "next/server";
// TODO: import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/items/:id — replace with your domain logic
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  console.log(id, body);
  return NextResponse.json({});
}

// DELETE /api/items/:id — replace with your domain logic
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  console.log(id);
  return new NextResponse(null, { status: 204 });
}
