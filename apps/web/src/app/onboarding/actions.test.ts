import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOrUpdateCreatorProfileAction } from "./actions";
import { isSupabaseEmailConfirmed } from "@/lib/auth/dashboard";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

class RedirectError extends Error {
  constructor(readonly location: string) {
    super(`Redirected to ${location}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: vi.fn((location: string) => {
    throw new RedirectError(location);
  }),
}));

vi.mock("@/lib/auth/dashboard", () => ({
  isSupabaseEmailConfirmed: vi.fn(),
}));

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: vi.fn(),
}));

vi.mock("@/lib/supabase/creator", () => ({
  ensureCreatorForUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockCreateClient = vi.mocked(createClient);
const mockEnsureCreatorForUser = vi.mocked(ensureCreatorForUser);
const mockIsSupabaseConfigured = vi.mocked(isSupabaseConfigured);
const mockIsSupabaseEmailConfirmed = vi.mocked(isSupabaseEmailConfirmed);

describe("createOrUpdateCreatorProfileAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSupabaseConfigured.mockReturnValue(true);
    mockIsSupabaseEmailConfirmed.mockReturnValue(true);
    mockEnsureCreatorForUser.mockResolvedValue({
      display_name: "Legacy Creator",
      handle: null,
      id: "legacy-creator-id",
      niche: null,
      onboarding_completed: false,
    });
  });

  it("updates the creator returned by ensureCreatorForUser without rewriting its id", async () => {
    const single = vi.fn(async () => ({
      data: { id: "legacy-creator-id" },
      error: null,
    }));
    const select = vi.fn(() => ({ single }));
    const eqUserId = vi.fn(() => ({ select }));
    const eqId = vi.fn(() => ({ eq: eqUserId }));
    const update = vi.fn(() => ({ eq: eqId }));
    const from = vi.fn(() => ({ update }));
    const user = {
      email: "creator@example.com",
      id: "11111111-1111-4111-8111-111111111111",
    };

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user },
          error: null,
        })),
      },
      from,
    } as never);

    const formData = new FormData();
    formData.set("displayName", "Updated Creator");
    formData.set("avatarUrl", "https://cdn.streamos.test/avatar.png");
    formData.set("bio", "StreamOS profile");
    formData.set("primaryLanguage", "DE");

    await expect(
      createOrUpdateCreatorProfileAction({}, formData),
    ).rejects.toMatchObject({
      location: "/onboarding/platforms",
    });

    expect(mockEnsureCreatorForUser).toHaveBeenCalledWith(
      expect.objectContaining({ from }),
      user,
    );
    expect(update).toHaveBeenCalledWith({
      avatar_url: "https://cdn.streamos.test/avatar.png",
      bio: "StreamOS profile",
      display_name: "Updated Creator",
      onboarding_completed: false,
      onboarding_step: 1,
      primary_language: "DE",
    });
    expect(eqId).toHaveBeenCalledWith("id", "legacy-creator-id");
    expect(eqUserId).toHaveBeenCalledWith(
      "user_id",
      "11111111-1111-4111-8111-111111111111",
    );
    expect(select).toHaveBeenCalledWith("id");
    expect(single).toHaveBeenCalled();
  });

  it("returns a form error when the creator update fails", async () => {
    const single = vi.fn(async () => ({
      data: null,
      error: { message: "update failed" },
    }));
    const select = vi.fn(() => ({ single }));
    const eqUserId = vi.fn(() => ({ select }));
    const eqId = vi.fn(() => ({ eq: eqUserId }));
    const update = vi.fn(() => ({ eq: eqId }));

    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              email: "creator@example.com",
              id: "11111111-1111-4111-8111-111111111111",
            },
          },
          error: null,
        })),
      },
      from: vi.fn(() => ({ update })),
    } as never);

    const formData = new FormData();
    formData.set("displayName", "Updated Creator");
    formData.set("avatarUrl", "");
    formData.set("bio", "");
    formData.set("primaryLanguage", "EN");

    await expect(
      createOrUpdateCreatorProfileAction({}, formData),
    ).resolves.toEqual({
      formError:
        "Creator-Profil konnte nicht gespeichert werden. Bitte versuche es erneut.",
    });
  });
});
