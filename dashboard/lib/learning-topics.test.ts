import { describe, expect, it } from "vitest";
import { LEARNING_TIERS, learningTopic, learningTopicCount, topicMatches } from "./learning-topics";

describe("Learning topics (RD06)", () => {
  const topics = LEARNING_TIERS.flatMap(tier => tier.topics);

  it("has unique ids and 23 topics across 5 tiers", () => {
    expect(learningTopicCount()).toBe(23);
    expect(LEARNING_TIERS).toHaveLength(5);
    expect(new Set(topics.map(topic => topic.id)).size).toBe(topics.length);
  });

  it("points every prerequisite at another existing topic", () => {
    for (const topic of topics) for (const id of topic.prerequisites ?? []) {
      expect(learningTopic(id), `${topic.id} → ${id}`).toBeDefined();
      expect(id).not.toBe(topic.id);
    }
  });

  it("gives every formula a label and keeps labels unique within a topic", () => {
    for (const topic of topics) {
      const labels = (topic.formulas ?? []).map(formula => formula.label);
      expect(labels.every(Boolean)).toBe(true);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("keeps myths to topics with a measured result", () => {
    const myths = topics.filter(topic => topic.myth);
    expect(myths.map(topic => topic.id)).toEqual(["stabilization", "shot-quality-making", "play-type-difficulty", "complementary-skills"]);
    for (const topic of myths) expect(topic.measured, topic.id).toBeDefined();
  });

  it("matches every word of a search against the topic's text", () => {
    const rapm = learningTopic("rapm")!.topic;
    expect(topicMatches(rapm, "")).toBe(true);
    expect(topicMatches(rapm, "ridge  STINT")).toBe(true);
    expect(topicMatches(rapm, "ridge wingspan")).toBe(false);
  });
});
