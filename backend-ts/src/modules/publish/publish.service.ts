import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { PublisherService } from "./publisher.service";

@Injectable()
export class PublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: PublisherService,
  ) {}

  private safe(v: string, fb: any) {
    try { return JSON.parse(v); } catch { return fb; }
  }

  // A single gate for direct publish and manual 'mark as published' confirmation.
  // No endpoint may claim a draft is published without the same reviewed image set.
  private reviewedImages(draft: any): string[] {
    const images = this.safe(draft.images, []);
    if (
      draft.status !== "ready" ||
      draft.complianceChecked !== true ||
      !Array.isArray(images) ||
      images.length < 1 ||
      images.length > 4 ||
      !images.every((image: any) => typeof image === "string" && image.length > 0)
    ) {
      throw new BadRequestException("草稿尚未通过人工审核，或配图数量不符合1–4张，禁止发布");
    }
    return images;
  }

  /**
   * 发布某草稿到某账号。
   * holdForManual=true：拟人填好图文但【不点发布】，浏览器留开给用户自己点；
   *                     草稿状态保持 ready，待用户确认后调 markPublished 收尾。
   */
  async publishDraft(draftId: string, accountId: string, opts?: { holdForManual?: boolean }) {
    const draft = await this.prisma.draft.findUnique({ where: { id: draftId } });
    if (!draft) throw new BadRequestException("草稿不存在");
    const images = this.reviewedImages(draft);
    const topics = this.safe(draft.hashtags, []);
    const hold = !!opts?.holdForManual;

    const job = await this.prisma.publishJob.create({
      data: {
        campaignId: draft.campaignId, draftId, accountId, scheduledAt: new Date(),
        status: hold ? "manual_filling" : "publishing",
      },
    });

    const res = await this.publisher.publishNote(accountId, { title: draft.title, body: draft.body, images, topics }, opts);

    if (hold) {
      // 留给人工点发布：作业标记等待人工，草稿仍为 ready（还没真正发出去）
      await this.prisma.publishJob.update({
        where: { id: job.id },
        data: { status: res.ok ? "awaiting_manual" : "failed", result: res.message, accountId },
      });
      return { ok: res.ok, message: res.message, manual: true };
    }

    await this.prisma.publishJob.update({
      where: { id: job.id },
      data: { status: res.ok ? "published" : "failed", result: res.url || res.message },
    });
    await this.prisma.draft.update({
      where: { id: draftId },
      data: { status: res.ok ? "published" : "failed", accountId },
    });
    return { ok: res.ok, message: res.message, url: res.url };
  }

  /** Only finish an existing manually-filled job after reviewed content and images. */
  async markPublished(draftId: string, accountId?: string) {
    if (!accountId || !accountId.trim()) {
      throw new BadRequestException("请先选择执行人工发布的账号，不能仅凭草稿ID标记发布");
    }
    const draft = await this.prisma.draft.findUnique({ where: { id: draftId } });
    if (!draft) throw new BadRequestException("草稿不存在");
    this.reviewedImages(draft);
    const heldJob = await this.prisma.publishJob.findFirst({
      where: { draftId, accountId, status: "awaiting_manual" },
      orderBy: { createdAt: "desc" },
    });
    if (!heldJob) {
      throw new BadRequestException("没有该账号对应的待人工确认记录，请先执行「拟人填写·自己发」并确认已发布");
    }
    // Reuse the original pending job as the audit record; do not create a duplicate
    // "published" job or silently mark a draft with no manual handoff.
    await this.prisma.$transaction([
      this.prisma.draft.update({
        where: { id: draftId },
        data: { status: "published", accountId },
      }),
      this.prisma.publishJob.update({
        where: { id: heldJob.id },
        data: { status: "published", result: "人工确认已发布" },
      }),
    ]);
    await this.publisher.releaseHeld(accountId);
    return { ok: true };
  }

  async jobsByCampaign(campaignId: string) {
    return this.prisma.publishJob.findMany({ where: { campaignId }, orderBy: { createdAt: "desc" } });
  }
}
