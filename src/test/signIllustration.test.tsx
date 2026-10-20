import { render, screen } from "@testing-library/react";

import { SignIllustration } from "@/components/signs/SignIllustration";
import { SIGN_MEDIA } from "@/data/signMedia";
import { SIGN_LIBRARY } from "@/data/signLibrary";

describe("SignIllustration", () => {
  it("shows the illustration and no video element when the slug has no clip", () => {
    const sign = SIGN_LIBRARY.find((entry) => entry.slug === "milk");
    if (!sign) throw new Error("sign library is missing milk");
    expect(SIGN_MEDIA.milk.video).toBeUndefined();
    expect(SIGN_MEDIA.milk.videoPoster).toBeUndefined();
    expect(SIGN_MEDIA.milk.illustration).not.toBeNull();

    const { container } = render(<SignIllustration sign={sign} />);

    expect(container.querySelector("video")).toBeNull();
    expect(screen.getByRole("img", { name: SIGN_MEDIA.milk.illustrationAlt })).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
