import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import CarFilters from "@/components/CarFilters";
import type { SortBy } from "@/hooks/useCarFilters";

/**
 * Years deliberately do NOT match any model year present in the seeded MSW
 * data, so an assertion can never be satisfied by a seeded record.
 */
const YEARS = [1987, 1993, 2031];

interface Spies {
  onSearchChange?: (value: string) => void;
  onYearChange?: (value: string) => void;
  onSortByChange?: (value: SortBy) => void;
  onClear?: () => void;
  years?: number[];
}

/**
 * CarFilters is fully controlled, so the harness owns the state and forwards
 * every change to the supplied spies.
 */
function Harness(props: Spies) {
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("year");

  return (
    <CarFilters
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        props.onSearchChange?.(value);
      }}
      year={year}
      onYearChange={(value) => {
        setYear(value);
        props.onYearChange?.(value);
      }}
      sortBy={sortBy}
      onSortByChange={(value) => {
        setSortBy(value);
        props.onSortByChange?.(value);
      }}
      years={props.years ?? YEARS}
      onClear={() => {
        setSearch("");
        setYear("");
        setSortBy("year");
        props.onClear?.();
      }}
    />
  );
}

/**
 * The filter search box must be identified by an accessible name that mentions
 * "search" and NOT "model": the add-car form renders its own "Model" text box on
 * the same screen, so a search label such as "Search model" would make the two
 * fields indistinguishable to assistive technology (and to `getByRole`).
 */
const isSearchName = (name: string): boolean =>
  /search/i.test(name) && !/model/i.test(name);

function getSearchBox(): HTMLElement {
  return screen.getByRole("textbox", { name: isSearchName });
}

function getYearSelect(): HTMLElement {
  return screen.getByRole("combobox", { name: /year/i });
}

function getSortSelect(): HTMLElement {
  return screen.getByRole("combobox", { name: /sort/i });
}

describe("CarFilters", () => {
  it("renders the controlled values it is given", () => {
    render(
      <CarFilters
        search="Nevera"
        onSearchChange={vi.fn()}
        year="1993"
        onYearChange={vi.fn()}
        sortBy="make"
        onSortByChange={vi.fn()}
        years={YEARS}
        onClear={vi.fn()}
      />
    );

    expect(getSearchBox()).toHaveValue("Nevera");
    expect(getYearSelect()).toHaveTextContent("1993");
    expect(getSortSelect()).toHaveTextContent(/make/i);
  });

  it("names the search box so it cannot be confused with a model field", () => {
    render(<Harness />);

    // Exactly one text box, and its accessible name does not mention "model".
    const textboxes = screen.getAllByRole("textbox");
    expect(textboxes).toHaveLength(1);
    expect(
      screen.queryByRole("textbox", { name: /model/i })
    ).not.toBeInTheDocument();
    expect(getSearchBox()).toBe(textboxes[0]);
  });

  it("reports every value typed into the model search box", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();

    render(<Harness onSearchChange={onSearchChange} />);

    const searchBox = getSearchBox();
    await user.type(searchBox, "Nevera");

    expect(onSearchChange.mock.calls.map((call) => call[0])).toEqual([
      "N",
      "Ne",
      "Nev",
      "Neve",
      "Never",
      "Nevera",
    ]);
    expect(searchBox).toHaveValue("Nevera");
  });

  it("offers every supplied year plus an all-years option and reports the chosen year", async () => {
    const user = userEvent.setup();
    const onYearChange = vi.fn();

    render(<Harness onYearChange={onYearChange} />);

    await user.click(getYearSelect());

    const listbox = screen.getByRole("listbox");
    const options = within(listbox).getAllByRole("option");

    // One option per supplied year, plus the "all years" option.
    expect(options).toHaveLength(YEARS.length + 1);
    expect(within(listbox).getByRole("option", { name: /all/i })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "1987" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "1993" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "2031" })).toBeInTheDocument();

    await user.click(within(listbox).getByRole("option", { name: "1993" }));

    expect(onYearChange).toHaveBeenCalledTimes(1);
    expect(onYearChange).toHaveBeenCalledWith("1993");
    expect(getYearSelect()).toHaveTextContent("1993");
  });

  it("reports the empty string when the all-years option is chosen", async () => {
    const user = userEvent.setup();
    const onYearChange = vi.fn();

    render(<Harness onYearChange={onYearChange} />);

    await user.click(getYearSelect());
    await user.click(
      within(screen.getByRole("listbox")).getByRole("option", { name: "2031" })
    );
    expect(onYearChange).toHaveBeenLastCalledWith("2031");

    await user.click(getYearSelect());
    await user.click(
      within(screen.getByRole("listbox")).getByRole("option", { name: /all/i })
    );

    expect(onYearChange).toHaveBeenLastCalledWith("");
  });

  it("lets the user sort by make and by year and reports the choice", async () => {
    const user = userEvent.setup();
    const onSortByChange = vi.fn();

    render(<Harness onSortByChange={onSortByChange} />);

    await user.click(getSortSelect());

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getAllByRole("option")).toHaveLength(2);
    expect(within(listbox).getByRole("option", { name: /year/i })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: /make/i })).toBeInTheDocument();

    await user.click(within(listbox).getByRole("option", { name: /make/i }));

    expect(onSortByChange).toHaveBeenCalledTimes(1);
    expect(onSortByChange).toHaveBeenCalledWith("make");
    expect(getSortSelect()).toHaveTextContent(/make/i);

    await user.click(getSortSelect());
    await user.click(
      within(screen.getByRole("listbox")).getByRole("option", { name: /year/i })
    );

    expect(onSortByChange).toHaveBeenCalledTimes(2);
    expect(onSortByChange).toHaveBeenLastCalledWith("year");
    expect(getSortSelect()).toHaveTextContent(/year/i);
  });

  it("invokes onClear when the clear control is activated", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    render(<Harness onClear={onClear} />);

    await user.type(getSearchBox(), "Nevera");
    expect(getSearchBox()).toHaveValue("Nevera");

    await user.click(screen.getByRole("button", { name: /clear/i }));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(getSearchBox()).toHaveValue("");
  });
});
