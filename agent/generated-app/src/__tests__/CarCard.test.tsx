import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import CarCard from "@/components/CarCard";
import type { Car } from "@/types";

// Deliberately distinct from every MSW-seeded record so the assertions below
// can only ever match the car this test supplies.
const car: Car = {
  id: "907",
  make: "Citroen",
  model: "SM",
  year: 1972,
  color: "Aubergine",
  mobile: "https://placehold.co/640x360?text=Citroen+SM+Mobile",
  tablet: "https://placehold.co/1023x576?text=Citroen+SM+Tablet",
  desktop: "https://placehold.co/1440x810?text=Citroen+SM+Desktop",
};

function normalizeMedia(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

describe("CarCard", () => {
  it("shows the make, model, year and color", () => {
    render(<CarCard car={car} />);

    expect(screen.getByText(/Citroen/)).toBeInTheDocument();
    expect(screen.getByText(/SM/)).toBeInTheDocument();
    expect(screen.getByText(/1972/)).toBeInTheDocument();
    expect(screen.getByText(/Aubergine/)).toBeInTheDocument();
  });

  it("renders an accessible image whose alt names the car", () => {
    render(<CarCard car={car} />);

    const img = screen.getByRole("img", {
      name: /citroen\s+sm/i,
    }) as HTMLImageElement;

    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe("IMG");
    // The <img> is the fallback inside <picture>; it carries the desktop asset.
    expect(img.getAttribute("src")).toBe(car.desktop);
  });

  it("wraps the image in a <picture> element", () => {
    const { container } = render(<CarCard car={car} />);

    const picture = container.querySelector("picture");
    expect(picture).not.toBeNull();

    const img = screen.getByRole("img", { name: /citroen\s+sm/i });
    expect(picture).toContainElement(img);
  });

  it("serves the mobile source at 640px and below", () => {
    const { container } = render(<CarCard car={car} />);

    const sources = Array.from(
      container.querySelectorAll<HTMLSourceElement>("picture source")
    );

    const mobile = sources.find(
      (source) => normalizeMedia(source.getAttribute("media")) === "(max-width: 640px)"
    );

    expect(mobile, "expected a <source media=\"(max-width: 640px)\">").toBeDefined();
    expect(mobile?.getAttribute("srcSet") ?? mobile?.srcset).toBe(car.mobile);
  });

  it("serves the tablet source between 641px and 1023px", () => {
    const { container } = render(<CarCard car={car} />);

    const sources = Array.from(
      container.querySelectorAll<HTMLSourceElement>("picture source")
    );

    const tablet = sources.find(
      (source) =>
        normalizeMedia(source.getAttribute("media")) ===
        "(min-width: 641px) and (max-width: 1023px)"
    );

    expect(
      tablet,
      'expected a <source media="(min-width: 641px) and (max-width: 1023px)">'
    ).toBeDefined();
    expect(tablet?.getAttribute("srcSet") ?? tablet?.srcset).toBe(car.tablet);
  });

  it("serves the desktop source at 1024px and above", () => {
    const { container } = render(<CarCard car={car} />);

    const sources = Array.from(
      container.querySelectorAll<HTMLSourceElement>("picture source")
    );

    const desktop = sources.find(
      (source) =>
        normalizeMedia(source.getAttribute("media")) === "(min-width: 1024px)"
    );

    expect(desktop, 'expected a <source media="(min-width: 1024px)">').toBeDefined();
    expect(desktop?.getAttribute("srcSet") ?? desktop?.srcset).toBe(car.desktop);
  });

  it("declares the three breakpoints in mobile-first-to-desktop order without overlap", () => {
    const { container } = render(<CarCard car={car} />);

    const sources = Array.from(
      container.querySelectorAll<HTMLSourceElement>("picture source")
    );

    expect(sources).toHaveLength(3);

    expect(sources.map((source) => normalizeMedia(source.getAttribute("media")))).toEqual([
      "(max-width: 640px)",
      "(min-width: 641px) and (max-width: 1023px)",
      "(min-width: 1024px)",
    ]);

    expect(
      sources.map((source) => source.getAttribute("srcSet") ?? source.srcset)
    ).toEqual([car.mobile, car.tablet, car.desktop]);
  });
});