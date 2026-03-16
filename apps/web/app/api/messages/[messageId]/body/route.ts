import { NextResponse, type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { gmailAdapter } from "@envelope/providers-gmail";
import { requireAuthenticatedRequest } from "@/lib/server/guards";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/server/http";
import { ensureFreshAccountProviderContext } from "@/lib/server/provider-context";
import { sanitizeHtml } from "@/lib/server/sanitize-html";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
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

    const { messageId } = await params;
    const message = await appRepository.getMessageById({
      accountId,
      messageId,
    });

    if (!message) {
      return notFound("Message not found");
    }

    if (message.textBody || message.htmlBody) {
      return NextResponse.json({
        messageId,
        bodyState: message.bodyState,
        textBody: message.textBody,
        htmlBody: message.htmlBody ? sanitizeHtml(message.htmlBody) : null,
      });
    }

    let fullMessage:
      | {
          textBody?: string;
          htmlBody?: string;
        }
      | null = null;

    try {
      const providerContext = await ensureFreshAccountProviderContext(accountId);
      fullMessage = await gmailAdapter.mail.getMessage({
        account: providerContext,
        providerMessageId: message.providerMessageId,
        includeBodies: true,
      });
    } catch (fetchError) {
      await appRepository.markMessageBodyFetchFailed({
        accountId,
        providerMessageId: message.providerMessageId,
      });
      return serverError(fetchError instanceof Error ? fetchError.message : "Failed to fetch message body");
    }

    await appRepository.updateMessageBodies({
      accountId,
      providerMessageId: message.providerMessageId,
      textBody: fullMessage.textBody,
      htmlBody: fullMessage.htmlBody,
    });

    return NextResponse.json({
      messageId,
      bodyState: "present",
      textBody: fullMessage.textBody,
      htmlBody: fullMessage.htmlBody ? sanitizeHtml(fullMessage.htmlBody) : null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    return serverError(error instanceof Error ? error.message : "Failed to load message body");
  }
}
