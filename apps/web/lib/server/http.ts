import { NextResponse } from "next/server";

export const badRequest = (message: string) =>
  NextResponse.json({ error: message }, { status: 400 });

export const unauthorized = (message = "Unauthorized") =>
  NextResponse.json({ error: message }, { status: 401 });

export const forbidden = (message = "Forbidden") =>
  NextResponse.json({ error: message }, { status: 403 });

export const notFound = (message = "Not found") =>
  NextResponse.json({ error: message }, { status: 404 });

export const serverError = (message = "Internal server error") =>
  NextResponse.json({ error: message }, { status: 500 });
