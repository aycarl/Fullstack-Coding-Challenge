import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import CarFilters from "@/components/CarFilters";

/**
 * Contract under test:
 *
 *   import CarFilters from "@/components/CarFilters";
 *
 *   <CarFilters
 *     search={string}
 *     onSearchChange={(value: string) => void}
 *     sortBy={'year' | 'make'}
 *     onSortByChange={(value: 'year' | 'make') => void}
 *   />
 *
 * The component is fully controlled: it renders a search textbox whose
 * accessible name mentions "search", and a sort control (accessible name
 * mentions "sort") offering "Year" and "Make" options.
 */

function noop(): void {
  /* intentionally empty */
}

// A tiny stateful harness so we can observe the controlled component the way
// the application drives it: every reported value is fed straight back in.
function ControlledFilters({
  initialSearch = "",
  initialSortBy = "year",
  onSearchChange,
  onSortByChange,
}: {
  initialSearch?: string;
  initialSortBy?: "year" | "make";
  onSearchChange?: (value: string) => void;
  onSortByChange?: (value: "year" | "make") => void;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [sortBy, setSortBy] = useState<"year" | "make">(initialSortBy);

  return (
    <CarFilters
      search={search}
      onSearchChange={(value) => {
        onSearchChange?.(value);
        setSearch(value);
      }}
      sortBy={sortBy}
      onSortByChange={(value) => {
        onSortByChange?.(value);
        setSortBy(value);
      }}
    />
  );
}

async function chooseSortOption(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
  const sortControl = screen.getByRole("combobox", { name: /sort/i });
  await user.click(sortControl);

  const listbox = await screen.findByRole("listbox");
  await user.click(within(listbox).getByRole("option", { name: label }));
}

describe("CarFilters", () => {
  it("reflects the passed search value in the search textbox", () => {
    render(
      <CarFilters
        search="Bertone"
        onSearchChange={noop}
        sortBy="year"
        onSortByChange={noop}
      />
    );

    expect(screen.getByRole("textbox", { name: /search/i })).toHaveValue(
      "Bertone"
    );
  });

  it("reflects sortBy='year' in the sort control", () => {
    render(
      <CarFilters
        search=""
        onSearchChange={noop}
        sortBy="year"
        onSortByChange={noop}
      />
    );

    const sortControl = screen.getByRole("combobox", { name: /sort/i });
    expect(sortControl).toBeInTheDocument();
    expect(sortControl).toHaveTextContent(/year/i);
    expect(sortControl).not.toHaveTextContent(/make/i);
  });

  it("reflects sortBy='make' in the sort control", () => {
    render(
      <CarFilters
        search=""
        onSearchChange={noop}
        sortBy="make"
        onSortByChange={noop}
      />
    );

    const sortControl = screen.getByRole("combobox", { name: /sort/i });
    expect(sortControl).toHaveTextContent(/make/i);
    expect(sortControl).not.toHaveTextContent(/year/i);
  });

  it("calls onSearchChange once per keystroke with the value typed so far", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();

    render(<ControlledFilters onSearchChange={onSearchChange} />);

    const textbox = screen.getByRole("textbox", { name: /search/i });
    await user.type(textbox, "Saab");

    expect(onSearchChange).toHaveBeenCalledTimes(4);
    expect(onSearchChange.mock.calls.map((call) => call[0])).toEqual([
      "S",
      "Sa",
      "Saa",
      "Saab",
    ]);
    expect(onSearchChange).toHaveBeenLastCalledWith("Saab");
    expect(textbox).toHaveValue("Saab");
  });

  it("reports each typed character when the search value is held constant", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();

    render(
      <CarFilters
        search=""
        onSearchChange={onSearchChange}
        sortBy="year"
        onSortByChange={noop}
      />
    );

    const textbox = screen.getByRole("textbox", { name: /search/i });
    await user.type(textbox, "SM");

    // The component never stores its own state: with search pinned to "",
    // each keystroke is reported as a single character.
    expect(onSearchChange).toHaveBeenCalledTimes(2);
    expect(onSearchChange).toHaveBeenNthCalledWith(1, "S");
    expect(onSearchChange).toHaveBeenNthCalledWith(2, "M");
    expect(textbox).toHaveValue("");
  });

  it("calls onSearchChange with an empty string when the search text is cleared", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();

    render(
      <ControlledFilters initialSearch="Fulvia" onSearchChange={onSearchChange} />
    );

    const textbox = screen.getByRole("textbox", { name: /search/i });
    await user.clear(textbox);

    expect(onSearchChange).toHaveBeenLastCalledWith("");
    expect(textbox).toHaveValue("");
  });

  it("calls onSortByChange with 'make' when the Make option is chosen", async () => {
    const user = userEvent.setup();
    const onSortByChange = vi.fn();

    render(
      <CarFilters
        search=""
        onSearchChange={noop}
        sortBy="year"
        onSortByChange={onSortByChange}
      />
    );

    await chooseSortOption(user, /^make$/i);

    expect(onSortByChange).toHaveBeenCalledTimes(1);
    expect(onSortByChange).toHaveBeenCalledWith("make");
  });

  it("calls onSortByChange with 'year' when the Year option is chosen", async () => {
    const user = userEvent.setup();
    const onSortByChange = vi.fn();

    render(
      <CarFilters
        search=""
        onSearchChange={noop}
        sortBy="make"
        onSortByChange={onSortByChange}
      />
    );

    await chooseSortOption(user, /^year$/i);

    expect(onSortByChange).toHaveBeenCalledTimes(1);
    expect(onSortByChange).toHaveBeenCalledWith("year");
  });

  it("offers exactly the Year and Make sort options", async () => {
    const user = userEvent.setup();

    render(
      <CarFilters
        search=""
        onSearchChange={noop}
        sortBy="year"
        onSortByChange={noop}
      />
    );

    await user.click(screen.getByRole("combobox", { name: /sort/i }));

    const listbox = await screen.findByRole("listbox");
    const options = within(listbox).getAllByRole("option");

    expect(options).toHaveLength(2);
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      "Year",
      "Make",
    ]);
  });

  it("shows the new sort selection once the parent feeds the value back in", async () => {
    const user = userEvent.setup();
    const onSortByChange = vi.fn();

    render(
      <ControlledFilters initialSortBy="year" onSortByChange={onSortByChange} />
    );

    await chooseSortOption(user, /^make$/i);

    expect(onSortByChange).toHaveBeenCalledWith("make");
    expect(screen.getByRole("combobox", { name: /sort/i })).toHaveTextContent(
      /make/i
    );
  });

  it("does not call onSearchChange or onSortByChange on the initial render", () => {
    const onSearchChange = vi.fn();
    const onSortByChange = vi.fn();

    render(
      <CarFilters
        search="Sonett"
        onSearchChange={onSearchChange}
        sortBy="make"
        onSortByChange={onSortByChange}
      />
    );

    expect(onSearchChange).not.toHaveBeenCalled();
    expect(onSortByChange).not.toHaveBeenCalled();
  });
});