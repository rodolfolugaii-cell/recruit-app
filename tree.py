import os

IGNORE = {"node_modules", ".git", ".next", "__pycache__"}
OUTPUT_FILE = "folder_tree.txt"


def generate_tree(start_path='.', prefix=''):
    tree_lines = []

    entries = [e for e in os.listdir(start_path) if e not in IGNORE]
    entries = sorted(
        entries,
        key=lambda x: (not os.path.isdir(os.path.join(start_path, x)), x.lower())
    )

    entries_count = len(entries)

    for index, entry in enumerate(entries):
        path = os.path.join(start_path, entry)
        connector = "└── " if index == entries_count - 1 else "├── "
        line = prefix + connector + entry
        tree_lines.append(line)

        if os.path.isdir(path):
            extension = "    " if index == entries_count - 1 else "│   "
            tree_lines.extend(generate_tree(path, prefix + extension))

    return tree_lines


if __name__ == "__main__":
    root_name = os.path.basename(os.getcwd())
    tree_output = [root_name + "/"]
    tree_output.extend(generate_tree())

    # Print to console
    for line in tree_output:
        print(line)

    # Save to text file
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(tree_output))

    print(f"\nTree exported to: {OUTPUT_FILE}")

    # Prevent abrupt closing
    input("\nPress Enter to exit...")