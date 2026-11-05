import os
from collections import Counter

q_dir = r'Lextria Finance Dashboard\Quotations'
exts = Counter()
dirs = []
files_by_ext = {}

for root, d_names, f_names in os.walk(q_dir):
    rel = os.path.relpath(root, q_dir)
    if rel == '.':
        dirs = d_names
    for f in f_names:
        ext = os.path.splitext(f)[1].lower()
        exts[ext] += 1
        if ext not in files_by_ext:
            files_by_ext[ext] = []
        if len(files_by_ext[ext]) < 5:
            files_by_ext[ext].append(os.path.join(rel, f))

print(f"Total client/category top-level folders: {len(dirs)}")
print("Top-level folders (sample 30):")
for d in dirs[:30]:
    print("  ", d)

print("\nFile extensions breakdown:")
for ext, count in exts.most_common():
    print(f"  {ext or '(none)'}: {count}")

print("\nSample files by extension:")
for ext, samples in files_by_ext.items():
    print(f"  [{ext}]:")
    for s in samples[:3]:
        print(f"     {s}")

