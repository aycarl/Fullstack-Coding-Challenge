import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import type { MockedResponse } from "@apollo/client/testing";
import { describe, it, expect, vi } from "vitest";
import { GET_CARS } from "@/graphql/queries";
import CarList from "@/components/CarList";

/**
 * Fixtures deliberately use makes/models/years that do NOT appear in the seeded
 * MSW data, so an assertion can never be satisfied by a seeded record.
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

const nevera = makeCar("951", "Rimac", "Nevera", 2022, "Midnight Purple");
const jesko = makeCar("952", "Koenigsegg", "Jesko", 2023, "Ghost White");
const huayra = makeCar("953", "Pagani", "Huayra", 2021, "Carbon Blue");
const nevermore = makeCar("954", "Zenvo", "Nevermore", 2023, "Matte Bronze");

const allCars = [nevera, jesko, huayra, nevermore];

const successMocks: MockedResponse[] = [
  {
    request: { query: GET_CARS },
    result: { data: { cars: allCars } },
  },
];

const failureMocks: MockedResponse[] = [
  {
    request: { query: GET_CARS },
    error: new Error("Failed to load inventory"),
  },
];

function renderList(
  mocks: readonly MockedResponse[] = successMocks,
  onSelectCar?: (id: string) => void
) {
  return render(
    <MockedProvider mocks={[...mocks]}>
      <CarList {...(onSelectCar ? { onSelectCar } : {})} />
    </MockedProvider>
  );
}

/**
 * Each rendered card carries a fallback <img> whose alt is
 * `${year} ${make} ${model}` (see CarCard), so the alt texts in DOM order are a
 * faithful, ordered view of the rendered cards.
 */
function renderedCardLabels(): string[] {
  return screen
    .queryAllByAltText(/^\d{4} /)
    .map((img) => img.getAttribute("alt") ?? "");
}

function renderedYears(): number[] {
  return renderedCardLabels().map((label) => Number(label.split(" ")[0]));
}

function renderedMakes(): string[] {
  return renderedCardLabels().map((label) => label.split(" ")[1] ?? "");
}

function renderedModels(): string[] {
  return renderedCardLabels().map((label) =>
    label.split(" ").slice(2).join(" ")
  );
}

function getSearchBox(): HTMLElement {
  return screen.getByRole("textbox", { name: /search/i });
}

function getYearSelect(): HTMLElement {
  return screen.getByRole("combobox", { name: /year/i });
}

function getSortSelect(): HTMLElement {
  return screen.getByRole("combobox", { name: /sort/i });
}

async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  combobox: HTMLElement,
  name: RegExp | string
) {
  await user.click(combobox);
  const listbox = await screen.findByRole("listbox");
  await user.click(within(listbox).getByRole("option", { name }));
  await waitFor(() =>
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  );
}

async function waitForCards(count: number) {
  await waitFor(() => expect(renderedCardLabels()).toHaveLength(count));
}

describe("CarList", () => {
  it("shows a loading indicator before the cars arrive", async () => {
    renderList();

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(renderedCardLabels()).toHaveLength(0);

    await waitForCards(allCars.length);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("renders one card per car returned by the API", async () => {
    renderList();

    await waitForCards(4);

    expect(renderedModels().sort()).toEqual([
      "Huayra",
      "Jesko",
      "Nevera",
      "Nevermore",
    ]);
    expect(screen.getByText(/Midnight Purple/)).toBeInTheDocument();
    expect(screen.getByText(/Ghost White/)).toBeInTheDocument();
    expect(screen.getByText(/Carbon Blue/)).toBeInTheDocument();
    expect(screen.getByText(/Matte Bronze/)).toBeInTheDocument();
  });

  it("shows an error message when the cars query fails", async () => {
    renderList(failureMocks);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/failed to load inventory/i);
    expect(renderedCardLabels()).toHaveLength(0);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("narrows the visible cards as a model is typed into the search box", async () => {
    const user = userEvent.setup();
    renderList();

    await waitForCards(4);

    await user.type(getSearchBox(), "neve");

    await waitFor(() =>
      expect(renderedModels().sort()).toEqual(["Nevera", "Nevermore"])
    );
    expect(screen.queryByAltText("2021 Pagani Huayra")).not.toBeInTheDocument();
    expect(
      screen.queryByAltText("2023 Koenigsegg Jesko")
    ).not.toBeInTheDocument();

    await user.clear(getSearchBox());
    await user.type(getSearchBox(), "huayra");

    await waitFor(() => expect(renderedModels()).toEqual(["Huayra"]));
  });

  it("narrows the visible cards to the picked year", async () => {
    const user = userEvent.setup();
    renderList();

    await waitForCards(4);

    await chooseOption(user, getYearSelect(), "2023");

    await waitFor(() => expect(renderedCardLabels()).toHaveLength(2));
    expect(renderedYears()).toEqual([2023, 2023]);
    expect(renderedModels().sort()).toEqual(["Jesko", "Nevermore"]);
  });

  it("combines a year and a partial model so only cars matching both remain", async () => {
    const user = userEvent.setup();
    renderList();

    await waitForCards(4);

    await user.type(getSearchBox(), "neve");
    await waitFor(() => expect(renderedCardLabels()).toHaveLength(2));

    await chooseOption(user, getYearSelect(), "2023");

    await waitFor(() => expect(renderedCardLabels()).toHaveLength(1));
    expect(renderedCardLabels()).toEqual(["2023 Zenvo Nevermore"]);
  });

  it("restores every card when the filters are cleared", async () => {
    const user = userEvent.setup();
    renderList();

    await waitForCards(4);

    await user.type(getSearchBox(), "neve");
    await chooseOption(user, getYearSelect(), "2023");
    await waitFor(() => expect(renderedCardLabels()).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: /clear/i }));

    await waitFor(() => expect(renderedCardLabels()).toHaveLength(4));
    expect(getSearchBox()).toHaveValue("");
    expect(renderedModels().sort()).toEqual([
      "Huayra",
      "Jesko",
      "Nevera",
      "Nevermore",
    ]);
  });

  it("reorders the rendered cards when the sort field changes", async () => {
    const user = userEvent.setup();
    renderList();

    await waitForCards(4);

    await chooseOption(user, getSortSelect(), /make/i);

    await waitFor(() =>
      expect(renderedMakes()).toEqual([
        "Koenigsegg",
        "Pagani",
        "Rimac",
        "Zenvo",
      ])
    );

    await chooseOption(user, getSortSelect(), /year/i);

    await waitFor(() => expect(renderedYears()).toEqual([2021, 2022, 2023, 2023]));
  });

  it("calls onSelectCar with the id of the selected car", async () => {
    const user = userEvent.setup();
    const onSelectCar = vi.fn();

    renderList(successMocks, onSelectCar);

    await waitForCards(4);

    await user.click(screen.getByText(/Jesko/));

    expect(onSelectCar).toHaveBeenCalledTimes(1);
    expect(onSelectCar).toHaveBeenCalledWith("952");

    await user.click(screen.getByText(/Huayra/));

    expect(onSelectCar).toHaveBeenCalledTimes(2);
    expect(onSelectCar).toHaveBeenLastCalledWith("953");
  });

  it("does not throw when a card is selected without an onSelectCar handler", async () => {
    const user = userEvent.setup();
    renderList();

    await waitForCards(4);

    await user.click(screen.getByText(/Nevermore/));

    expect(renderedCardLabels()).toHaveLength(4);
  });
});