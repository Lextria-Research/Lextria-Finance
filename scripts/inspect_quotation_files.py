import os
import re

q_dir = r'Lextria Finance Dashboard\Quotations'

client_files = {}
for root, dirs, files in os.walk(q_dir):
    rel = os.path.relpath(root, q_dir)
    if rel == '.':
        continue
    top_folder = rel.split(os.sep)[0]
    if top_folder not in client_files:
        client_files[top_folder] = []
    for f in files:
        if not f.startswith('~$') and not f.endswith('.tmp'):
            client_files[top_folder].append(os.path.join(rel, f))

print(f"Total top folders with files: {len(client_files)}")

# Print 20 sample folders and their files
for folder, files in sorted(client_files.items())[:20]:
    print(f"\nFolder: '{folder}' ({len(files)} files)")
    for f in files[:4]:
        print(f"   {os.path.basename(f)}")

