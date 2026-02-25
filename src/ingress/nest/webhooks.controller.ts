import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { IngressService } from "./ingress.service.js";

interface RawBodyRequest extends FastifyRequest {
  rawBody?: string;
}

@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly ingress: IngressService) {}

  private requireRawBody(req: RawBodyRequest): string {
    if (typeof req.rawBody !== "string") {
      throw new BadRequestException("raw body unavailable; check raw-body middleware setup");
    }

    return req.rawBody;
  }

  @Post("telegram")
  @HttpCode(HttpStatus.OK)
  async telegram(@Req() req: RawBodyRequest): Promise<{ ok: boolean }> {
    this.ingress.ingestTelegram(this.requireRawBody(req), req.headers);
    return { ok: true };
  }

  @Post("slack")
  async slack(@Req() req: RawBodyRequest, @Res() res: FastifyReply): Promise<void> {
    const result = this.ingress.ingestSlack(this.requireRawBody(req), req.headers);
    if (result.challenge) {
      res.code(HttpStatus.OK).send({ challenge: result.challenge });
      return;
    }

    res.code(HttpStatus.OK).send({ ok: true });
  }

  @Post("discord")
  async discord(@Req() req: RawBodyRequest, @Res() res: FastifyReply): Promise<void> {
    const result = this.ingress.ingestDiscord(this.requireRawBody(req), req.headers);
    if (result.isPing) {
      res.code(HttpStatus.OK).send({ type: 1 });
      return;
    }

    res.code(HttpStatus.OK).send({ ok: true });
  }

  @Get("whatsapp")
  async whatsappVerify(
    @Query() query: Record<string, string | undefined>,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const challenge = this.ingress.verifyWhatsApp(query);
    if (!challenge) {
      res.code(HttpStatus.FORBIDDEN).send({ error: "verification_failed" });
      return;
    }

    res.header("content-type", "text/plain").code(HttpStatus.OK).send(challenge);
  }

  @Post("whatsapp")
  @HttpCode(HttpStatus.OK)
  async whatsapp(@Req() req: RawBodyRequest): Promise<{ ok: boolean }> {
    this.ingress.ingestWhatsApp(this.requireRawBody(req), req.headers);
    return { ok: true };
  }

  @Post("signal")
  @HttpCode(HttpStatus.OK)
  async signal(@Body() payload: unknown): Promise<{ ok: boolean }> {
    this.ingress.ingestSignal(payload);
    return { ok: true };
  }

  @Post("email")
  @HttpCode(HttpStatus.OK)
  async email(@Body() payload: unknown): Promise<{ ok: boolean }> {
    this.ingress.ingestEmail(payload);
    return { ok: true };
  }
}
