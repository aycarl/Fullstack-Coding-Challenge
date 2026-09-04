import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import type { MockedResponse } from "@apollo/client/testing";
import { describe, it, expect, vi } from "vitest";
import { GET_CAR, GET_CARS } from "@/graphql/queries";
import CarDetail from "@/components/CarDetail";

/**
 * Fixtures deliberately use makes/models/years/colors that do NOT appear in the
 * seeded MSW data, so an assertion can never be satisfied by a seeded record.
 */
function makeCar(
  id: string,
  make: string,
  model: string,
  year: number,
  color: string
) {
  const label = `${make} ${model}`;
  return {
    __typename: "Car" as const,
    id,
    make,
    model,
    year,
    color,
    mobile: `https://placehold.co/640x360?text=${encodeURIComponent(label)}+Mobile`,
    tablet: `https://placehold.co/1023x576?text=${encodeURIComponent(label)}+Tablet`,
    desktop: `https://placehold.co/1440x810?text=${encodeURIComponent(label)}+Desktop`,
  };
}

// The car the detail view is asked for.
const jesko = makeCar("962", "Koenigsegg", "Jesko", 2023, "Ghost White");

// A *different* car, used as the only entry of any list already in memory, so
// the rendered detail can only have come from the single-car GET_CAR response.
const nevera = makeCar("961", "Rimac", "Nevera", 2022, "Midnight Purple");

const successMocks: MockedResponse[] = [
  {
    request: { query: GET_CARS },
    result: { data: { cars: [nevera] } },
  },
  {
    request: { query: GET_CAR, variables: { id: "962" } },
    result: { data: { car: jesko } },
  },
];

const failureMocks: MockedResponse[] = [
  {
    request: { query: GET_CAR, variables: { id: "999" } },
    error: new Error("Car with id 999 not found"),
  },
];

function renderDetail(
  id: string,
  mocks: readonly MockedResponse[],
  onBack?: () => void
) {
  return render(
    <MockedProvider mocks={[...mocks]}>
      <CarDetail id={id} {...(onBack ? { onBack } : {})} />
    </MockedProvider>
  );
}

function getPicture(container: HTMLElement): HTMLElement {
  const picture = container.querySelector("picture");
  expect(picture).not.toBeNull();
  return picture as HTMLElement;
}

describe("CarDetail", () => {
  it("shows a loading indicator while the car is being fetched", async () => {
    renderDetail("962", successMocks);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText(/Jesko/)).not.toBeInTheDocument();

    expect(await screen.findByText(/Jesko/)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("issues the single-car query for the requested id and renders that car", async () => {
    const carResult = vi.fn(() => ({ data: { car: jesko } }));

    const mocks: MockedResponse[] = [
      {
        request: { query: GET_CARS },
        result: { data: { cars: [nevera] } },
      },
      {
        request: { query: GET_CAR, variables: { id: "962" } },
        result: carResult,
      },
    ];

    renderDetail("962", mocks);

    await waitFor(() => expect(carResult).toHaveBeenCalledTimes(1));

    // The detail comes from GET_CAR, never from a list held in the cache.
    expect(await screen.findByText(/Koenigsegg/)).toBeInTheDocument();
    expect(screen.queryByText(/Rimac/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nevera/)).not.toBeInTheDocument();
  });

  it("renders the full record — make, model, year and color", async () => {
    renderDetail("962", successMocks);

    expect(await screen.findByText(/Koenigsegg/)).toBeInTheDocument();
    expect(screen.getByText(/Jesko/)).toBeInTheDocument();
    expect(screen.getByText(/2023/)).toBeInTheDocument();
    expect(screen.getByText(/Ghost White/)).toBeInTheDocument();
  });

  it("renders a responsive picture with mobile, tablet and desktop sources", async () => {
    const { container } = renderDetail("962", successMocks);

    await screen.findByText(/Jesko/);

    const picture = getPicture(container);
    const sources = Array.from(picture.querySelectorAll("source"));

    expect(sources).toHaveLength(3);

    const medias = sources.map((source) => source.getAttribute("media"));
    expect(medias).toEqual([
      "(min-width: 1024px)",
      "(min-width: 641px) and (max-width: 1023px)",
      "(max-width: 640px)",
    ]);

    const srcSets = sources.map(
      (source) => source.getAttribute("srcset") ?? source.getAttribute("srcSet")
    );
    expect(srcSets).toEqual([jesko.desktop, jesko.tablet, jesko.mobile]);
  });

  it("renders a fallback img with the mobile source and a descriptive alt", async () => {
    renderDetail("962", successMocks);

    const img = await screen.findByRole("img", { name: /Koenigsegg Jesko/i });
    expect(img).toHaveAttribute("src", jesko.mobile);
    expect(img).toHaveAttribute("alt", "2023 Koenigsegg Jesko");
  });

  it("shows an error message when the car cannot be fetched", async () => {
    renderDetail("999", failureMocks);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/car with id 999 not found/i);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/Jesko/)).not.toBeInTheDocument();
  });

  it("invokes onBack when the back control is activated", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();

    renderDetail("962", successMocks, onBack);

    await screen.findByText(/Jesko/);

    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("does not throw when the back control is activated without an onBack handler", async () => {
    const user = userEvent.setup();

    renderDetail("962", successMocks);

    await screen.findByText(/Jesko/);

    const back = screen.queryByRole("button", { name: /back/i });
    if (back) {
      await user.click(back);
    }

    expect(screen.getByText(/Jesko/)).toBeInTheDocument();
  });
});