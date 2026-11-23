import { render, screen, within } from "@testing-library/react";
import { HowToServeSheet } from "@/components/feeding/HowToServeSheet";
import { ServeShapeIllustration } from "@/components/feeding/ServeShapeIllustration";
import { FOOD_BY_SLUG, SERVE_SHAPES } from "@/lib/foodCatalog";
import type { SolidsMethod } from "@/lib/mealPlan";
import { SERVE_GAG_NOTE, SERVE_SAFETY_FOOTER, SERVE_SHAPE_CAPTIONS } from "@/lib/solidsAvoidCopy";

const show = (slug: string, method: SolidsMethod, ageMonths: number) =>
  render(<HowToServeSheet food={FOOD_BY_SLUG.get(slug)!} method={method} ageMonths={ageMonths} open onOpenChange={() => {}} />);

const shapeOf = (method: "blw" | "traditional") =>
  screen.getByTestId(`serve-shape-${method}`).querySelector("svg")!.getAttribute("data-shape");

describe("HowToServeSheet", () => {
  it("baby-led avocado at 7 months: a spear, its caption and the 6-8 prep", () => {
    show("avocado", "blw", 7);
    const avocado = FOOD_BY_SLUG.get("avocado")!;
    expect(screen.getByRole("heading", { name: "Avocado" })).toBeInTheDocument();
    expect(shapeOf("blw")).toBe("spear");
    expect(screen.getByText(SERVE_SHAPE_CAPTIONS.spear)).toBeInTheDocument();
    expect(screen.getByText(avocado.prep.blw["6-8"])).toBeInTheDocument();
    expect(screen.queryByTestId("serve-shape-traditional")).not.toBeInTheDocument();
  });

  it("follows the age band: baby-led avocado at 10 months is bite-size", () => {
    show("avocado", "blw", 10);
    expect(shapeOf("blw")).toBe("bite-size");
    expect(screen.getByText(FOOD_BY_SLUG.get("avocado")!.prep.blw["9-11"])).toBeInTheDocument();
  });

  it("uses the corrected age as given, floored into its band (11.9 months is still 9-11)", () => {
    show("avocado", "traditional", 11.9);
    expect(shapeOf("traditional")).toBe("mash");
    expect(screen.getByText(FOOD_BY_SLUG.get("avocado")!.prep.traditional["9-11"])).toBeInTheDocument();
  });

  it("follows the method: spoon-fed scrambled egg at 7 months is a mash, baby-led is a palm-chunk", () => {
    show("egg-scrambled", "mix", 7);
    expect(screen.getByRole("heading", { name: "Baby-led" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Spoon-fed" })).toBeInTheDocument();
    expect(shapeOf("blw")).toBe("palm-chunk");
    expect(shapeOf("traditional")).toBe("mash");
  });

  it("quartered grapes say lengthwise quarters", () => {
    show("grapes", "blw", 7);
    expect(shapeOf("blw")).toBe("quartered");
    expect(screen.getByText(SERVE_SHAPE_CAPTIONS.quartered)).toHaveTextContent(/lengthwise into quarters/);
  });

  it("lists the allergens the food contains, then the gagging note and the safety footer", () => {
    show("egg-scrambled", "blw", 9);
    expect(screen.getByText("Egg")).toBeInTheDocument();
    expect(screen.getByText("Gagging or choking?")).toBeInTheDocument();
    expect(screen.getByText(SERVE_GAG_NOTE)).toBeInTheDocument();
    expect(screen.getAllByText(SERVE_SAFETY_FOOTER).length).toBeGreaterThan(0);
  });

  it("shows no allergen badges for a food with none", () => {
    show("avocado", "blw", 7);
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).queryByText("Egg")).not.toBeInTheDocument();
  });
});

describe("ServeShapeIllustration", () => {
  it.each(SERVE_SHAPES)("%s is decorative, theme-aware line art with no hex colors", (shape) => {
    const { container } = render(<ServeShapeIllustration shape={shape} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(svg.children.length).toBeGreaterThan(0);
  });

  it("draws quartered as four long slivers, never coins", () => {
    const { container } = render(<ServeShapeIllustration shape="quartered" />);
    const pieces = container.querySelectorAll("path.fill-feeding\\/30");
    expect(pieces).toHaveLength(4);
    expect(container.querySelector("circle.fill-feeding\\/30")).toBeNull();
  });
});
