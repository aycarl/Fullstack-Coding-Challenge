import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import CarList from "@/components/CarList";
import type { Car } from "@/types";

// Fixtures are deliberately unlike every MSW-seeded record (see src/mocks/data.ts)
// so the assertions below can only ever match the cars this test supplies.
const cars: Car[] = [
  {
    id: "911",
    make: "Saab",
    model: "Sonett",
    year: 1967,
    color: "Marigold",
    mobile: "https://placehold.co/640x360?text=Saab+Sonett+Mobile",
    tablet: "https://placehold.co/1023x576?text=Saab+Sonett+Tablet",
    desktop: "https://placehold.co/1440x810?text=Saab+Sonett+Desktop",
  },
  {
    id: "912",
    make: "Lancia",
    model: "Fulvia",
    year: 1971,
    color: "Chartreuse",
    mobile: "https://placehold.co/640x360?text=Lancia+Fulvia+Mobile",
    tablet: "https://placehold.co/1023x576?text=Lancia+Fulvia+Tablet",
    desktop: "https://placehold.co/1440x810?text=Lancia+Fulvia+Desktop",
  },
];

describe("CarList", () => {
  it("renders one card per car with year, make, model and color", () => {
    render(<CarList cars={cars} loading={false} />);

    // One accessible image per car card.
    expect(screen.getByRole("img", { name: /saab\s+sonett/i })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /lancia\s+fulvia/i })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(cars.length);

    expect(screen.getByText(/1967/)).toBeInTheDocument();
    expect(screen.getByText(/Saab/)).toBeInTheDocument();
    expect(screen.getByText(/Sonett/)).toBeInTheDocument();
    expect(screen.getByText(/Marigold/)).toBeInTheDocument();

    expect(screen.getByText(/1971/)).toBeInTheDocument();
    expect(screen.getByText(/Lancia/)).toBeInTheDocument();
    expect(screen.getByText(/Fulvia/)).toBeInTheDocument();
    expect(screen.getByText(/Chartreuse/)).toBeInTheDocument();
  });

  it("shows a progress indicator while loading", () => {
    render(<CarList cars={[]} loading={true} />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not show a progress indicator once loading has finished", () => {
    render(<CarList cars={cars} loading={false} />);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows an alert containing the error message when error is given", () => {
    const error = new Error("Sonett inventory feed unavailable");

    render(<CarList cars={[]} loading={false} error={error} />);

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("Sonett inventory feed unavailable");

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("prefers the error alert over rendering car cards", () => {
    const error = new Error("Fulvia lookup exploded");

    render(<CarList cars={cars} loading={false} error={error} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Fulvia lookup exploded"
    );
    expect(
      screen.queryByRole("img", { name: /lancia\s+fulvia/i })
    ).not.toBeInTheDocument();
  });

  it("shows an empty-state message when cars is empty and not loading", () => {
    render(<CarList cars={[]} loading={false} />);

    expect(screen.getByText(/no cars/i)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not show the empty-state message when cars are present", () => {
    render(<CarList cars={cars} loading={false} />);

    expect(screen.queryByText(/no cars/i)).not.toBeInTheDocument();
  });
});