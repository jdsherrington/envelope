import { type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { gmailAdapter } from "@envelope/providers-gmail";
import { requireAuthenticatedRequest } from "@/lib/server/guards";
import { attachmentDisposition } from "@/lib/server/content-disposition";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/server/http";
import { ensureFreshAccountProviderContext } from "@/lib/server/provider-context";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string; attachmentId: string }> },
) {
  try {
    const auth = await requireAuthenticatedRequest(request);
    const accountId = request.nextUrl.searchParams.get("accountId");
    if (!accountId) {
      return badRequest("accountId is required");
    }

    const account = await appRepository.getAccountById(accountId);
    if (!account || account.userId !== auth.user.id) {
      return notFound("Account not found");
    }

    const { messageId, attachmentId } = await params;
    const message = await appRepository.getMessageById({
      accountId,
      messageId,
    });

    if (!message) {
      return notFound("Message not found");
    }

    const cached = await appRepository.getAttachmentCache({
      accountId,
      providerMessageId: message.providerMessageId,
      providerAttachmentId: attachmentId,
    });

    if (cached) {
      return new Response(Buffer.from(cached.bytesBase64, "base64"), {
        headers: {
          "Content-Type": cached.mimeType,
          "Content-Disposition": attachmentDisposition(cached.filename),
          "Cache-Control": "private, max-age=300",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const providerContext = await ensureFreshAccountProviderContext(accountId);
    const blob = await gmailAdapter.mail.getAttachment({
      account: providerContext,
      providerMessageId: message.providerMessageId,
      providerAttachmentId: attachmentId,
    });

    await appRepository.upsertAttachmentCache({
      accountId,
      providerMessageId: message.providerMessageId,
      providerAttachmentId: attachmentId,
      filename: blob.filename,
      mimeType: blob.mimeType,
      bytesBase64: blob.bytesBase64,
    });

    return new Response(Buffer.from(blob.bytesBase64, "base64"), {
      headers: {
        "Content-Type": blob.mimeType,
        "Content-Disposition": attachmentDisposition(blob.filename),
        "Cache-Control": blob.cacheControl ?? "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    return serverError(error instanceof Error ? error.message : "Failed to load attachment");
  }
}
