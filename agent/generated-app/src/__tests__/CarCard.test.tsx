import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import CarCard from "@/components/CarCard";
import type { Car } from "@/types";

/**
 * Fixture deliberately uses a make/model/year/color that does NOT appear in the
 * seeded MSW data, so an assertion can never be satisfied by a seeded record.
 */
const car: Car = {
  id: "907",
  make: "Rimac",
  model: "Nevera",
  year: 2022,
  color: "Midnight Purple",
  mobile: "https://placehold.co/640x360?text=Rimac+Nevera+Mobile",
  tablet: "https://placehold.co/1023x576?text=Rimac+Nevera+Tablet",
  desktop: "https://placehold.co/1440x810?text=Rimac+Nevera+Desktop",
};

function getPicture(container: HTMLElement): HTMLElement {
  const picture = container.querySelector("picture");
  expect(picture).not.toBeNull();
  return picture as HTMLElement;
}

describe("CarCard", () => {
  it("renders the make, model, year and color", () => {
    render(<CarCard car={car} />);

    expect(screen.getByText(/Rimac/)).toBeInTheDocument();
    expect(screen.getByText(/Nevera/)).toBeInTheDocument();
    expect(screen.getByText(/2022/)).toBeInTheDocument();
    expect(screen.getByText(/Midnight Purple/)).toBeInTheDocument();
  });

  it("renders a responsive picture with mobile, tablet and desktop sources", () => {
    const { container } = render(<CarCard car={car} />);

    const picture = getPicture(container);
    const sources = Array.from(picture.querySelectorAll("source"));

    expect(sources).toHaveLength(3);

    const bySrcSet = new Map(
      sources.map((source) => [
        source.getAttribute("srcset") ?? source.getAttribute("srcSet"),
        source.getAttribute("media"),
      ])
    );

    // Desktop: from 1024px upwards.
    expect(bySrcSet.get(car.desktop)).toBe("(min-width: 1024px)");

    // Tablet: 641px up to and including 1023px.
    expect(bySrcSet.get(car.tablet)).toBe(
      "(min-width: 641px) and (max-width: 1023px)"
    );

    // Mobile: up to and including 640px.
    expect(bySrcSet.get(car.mobile)).toBe("(max-width: 640px)");
  });

  it("orders the sources widest-first so the browser picks the right one", () => {
    const { container } = render(<CarCard car={car} />);

    const picture = getPicture(container);
    const medias = Array.from(picture.querySelectorAll("source")).map(
      (source) => source.getAttribute("media")
    );

    expect(medias).toEqual([
      "(min-width: 1024px)",
      "(min-width: 641px) and (max-width: 1023px)",
      "(max-width: 640px)",
    ]);
  });

  it("renders a fallback img with the mobile source and a descriptive alt", () => {
    render(<CarCard car={car} />);

    const img = screen.getByRole("img", { name: /Rimac Nevera/i });
    expect(img).toHaveAttribute("src", car.mobile);
    expect(img).toHaveAttribute("alt", "2022 Rimac Nevera");
  });

  it("calls onSelect with the car id when the card is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<CarCard car={car} onSelect={onSelect} />);

    await user.click(screen.getByText(/Nevera/));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("907");
  });

  it("does not throw when clicked without an onSelect handler", async () => {
    const user = userEvent.setup();

    render(<CarCard car={car} />);

    await user.click(screen.getByText(/Nevera/));

    expect(screen.getByText(/Nevera/)).toBeInTheDocument();
  });
});