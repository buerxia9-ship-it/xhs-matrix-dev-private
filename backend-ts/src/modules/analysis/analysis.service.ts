import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { CampaignService } from "../campaign/campaign.service";
import { GatewayService } from "../gateway/gateway.service";

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignService,
    private readonly gateway: GatewayService,
  ) {}

  // Evidence-first topic candidates: no paid inference and no fictional customer testimony.
  // A collected note title is a clue, not proof of an experience or a customer complaint.
  private conciseClue(input: unknown, product: string): string {
    let text = String(input || "")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/@[^\s，。:：]+/g, "")
      .replace(/\d{5,}/g, "")
      .replace(/\s+/g, " ")
      .trim();
    for (const phrase of ["亲测", "真实测评", "姐妹们", "零粉尘", "绝对", "TOP1", "首选", "必备"]) {
      text = text.split(phrase).join("");
    }
    if (product) text = text.split(product).join("");
    return Array.from(text).slice(0, 18).join("").trim();
  }

  private topicTitle(product: string, concern: string, region = ""): string {
    const name = product.replace(/[A-Za-z0-9_\-\s]/g, "").trim() || product;
    const scope = (region && !name.includes(region) ? region : "") + Array.from(name).slice(-6).join("");
    const clue = Array.from(concern).slice(0, 9).join("");
    const suffix = /[？?]$/.test(clue) ? "" : "怎么判断？";
    return Array.from(scope + "：" + clue + suffix).slice(0, 20).join("");
  }

  /**
   * Only source-linked existing data are used. Neither a note title nor a public comment
   * is a verified customer quote, delivery record, product test or current claim.
   * Existing Topic states are never deleted or reset.
   */
  async runForCampaign(campaignId: string) {
    const campaign = await this.campaigns.findOne(campaignId);
    const product = String(campaign.productName || campaign.name || "产品").trim();
    const keywords = Array.isArray(campaign.keywords)
      ? campaign.keywords.filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
    const terms = [...new Set([product, ...keywords].filter(x => x.length >= 2))];
    const region = keywords.includes("迪拜") ? "迪拜" : "";
    const rows = await this.prisma.note.findMany({
      where: { campaignId },
      select: { id: true, title: true, source: true, likes: true },
    });
    const notes = rows.filter(n => {
      const title = String(n.title || "").trim();
      const source = String(n.source || "");
      return title.length > 2 && source.length > 0 &&
        !/(mock|synthetic|fixture|示例|模拟)/i.test(source) &&
        !/(示例|模拟)/.test(title) &&
        (terms.length === 0 || terms.some(term => title.includes(term)));
    });
    if (!notes.length) {
      return { insightCount: 0, topicCount: 0, notesAnalyzed: 0, commentsAnalyzed: 0,
        aiPainPoints: 0, message: "没有可追溯的本项目笔记标题线索，不生成模拟痛点或选题，也未调用AI。" };
    }
    const allowedNoteIds = notes.map(n => n.id);
    const comments = await this.prisma.comment.findMany({
      where: { noteId: { in: allowedNoteIds } },
      select: { id: true, noteId: true, content: true },
    });
    const existing = await this.prisma.topic.findMany({
      where: { campaignId },
      select: { title: true, rationale: true, status: true },
    });
    const knownTitles = new Set(existing.map(t => t.title));
    const knownKeys = new Set(existing.map(t => {
      const text = String(t.rationale || "");
      return text.includes("evidence_key=") ? text.split("evidence_key=")[1].split("；")[0] : "";
    }).filter(Boolean));

    const candidates: Array<{ key: string; title: string; angle: string; rationale: string }> = [];
    for (const note of notes.slice(0, 5)) {
      const focus = this.conciseClue(note.title, product);
      if (Array.from(focus).length < 3) continue;
      const key = "note:" + note.id;
      candidates.push({
        key,
        title: this.topicTitle(product, focus, region),
        angle: "基于本项目采集笔记标题的选题线索：" + focus + "。只用于讨论判断方法，不构成体验或评论事实。",
        rationale: "证据类型=采集笔记标题；evidence_key=" + key +
          "；note_id=" + note.id + "；confidence=title_clue_only；" +
          "仅有标题，没有核实正文、评论、客户反馈、当次测试或配送；需人工复核。",
      });
    }
    for (const comment of comments.slice(0, 7)) {
      const focus = this.conciseClue(comment.content, product);
      if (Array.from(focus).length < 3) continue;
      const key = "comment:" + comment.id;
      candidates.push({
        key,
        title: this.topicTitle(product, focus, region),
        angle: "基于已关联公开评论的选题线索：" + focus + "。需核实上下文，不能当作客户体验。",
        rationale: "证据类型=关联评论线索；evidence_key=" + key +
          "；note_id=" + comment.noteId + "；comment_id=" + comment.id +
          "；confidence=unverified_public_comment；" +
          "公开评论不等于本店客户、亲测或证实结论；需人工复核。",
      });
    }
    let topicCount = 0;
    for (const candidate of candidates) {
      if (knownKeys.has(candidate.key) || knownTitles.has(candidate.title)) continue;
      await this.prisma.topic.create({
        data: { campaignId, title: candidate.title, angle: candidate.angle,
          rationale: candidate.rationale, hotScore: 1, status: "candidate" },
      });
      knownKeys.add(candidate.key);
      knownTitles.add(candidate.title);
      topicCount++;
    }
    return { insightCount: 0, topicCount, notesAnalyzed: notes.length,
      commentsAnalyzed: comments.length, aiPainPoints: 0,
      message: "仅基于可追溯采集标题或关联公开评论生成待人工审核候选，未调用AI；标题不等于客户反馈，未删除任何历史选题。" };
  }

  /** 导入自己的客户真实痛点（每行一条），作为痛点 + 选题 */
  async importPainPoints(campaignId: string, text: string) {
    const campaign = await this.campaigns.findOne(campaignId);
    const product = campaign.productName || campaign.name;
    const lines = (text || "")
      .split(/[\n;；]+/)
      .map((l) => l.trim())
      .filter((l) => l.length >= 2)
      .slice(0, 30);
    let count = 0;
    for (const line of lines) {
      // 取前 6 字做痛点关键词，整句做问题
      const topicWord = line.replace(/[，。,.!！?？]/g, "").slice(0, 8);
      await this.prisma.commentInsight.create({
        data: { campaignId, topic: topicWord, keywords: JSON.stringify([topicWord]), frequency: 0,
          sampleIds: JSON.stringify([]), source: "人工导入待复核" },
      });
      await this.prisma.topic.create({
        data: { campaignId, title: this.topicTitle(product, topicWord), angle: `回应「${topicWord}」`,
          rationale: `人工导入线索（尚未核实为真实客户反馈）：${line}`, hotScore: 1000, status: "candidate" }, // 客户导入权重最高
      });
      count++;
    }
    return { imported: count };
  }

  async insightsByCampaign(campaignId: string) {
    const rows = await this.prisma.commentInsight.findMany({
      where: { campaignId },
      orderBy: { frequency: "desc" },
    });
    return rows.map((r) => ({ ...r, keywords: this.safeParse(r.keywords, []), sampleIds: this.safeParse(r.sampleIds, []) }));
  }

  async topicsByCampaign(campaignId: string) {
    return this.prisma.topic.findMany({
      where: { campaignId },
      orderBy: [{ status: "asc" }, { hotScore: "desc" }],
    });
  }

  async updateTopicStatus(id: string, status: "adopted" | "discarded" | "candidate") {
    return this.prisma.topic.update({ where: { id }, data: { status } });
  }

  async sampleComments(ids: string[]) {
    if (!ids?.length) return [];
    return this.prisma.comment.findMany({ where: { id: { in: ids } } });
  }

  private safeParse(v: string, fb: any) {
    try {
      return JSON.parse(v);
    } catch {
      return fb;
    }
  }
}
