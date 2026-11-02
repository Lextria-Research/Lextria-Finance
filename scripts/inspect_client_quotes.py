import os
import zipfile
import xml.etree.ElementTree as ET

q_dir = r'Lextria Finance Dashboard\Quotations'

def read_docx_snippet(path):
    try:
        with zipfile.ZipFile(path) as z:
            xml_content = z.read('word/document.xml')
            tree = ET.fromstring(xml_content)
            texts = []
            for elem in tree.iter():
                if elem.tag.endswith('}t'):
                    if elem.text: texts.append(elem.text)
                elif elem.tag.endswith('}p') or elem.tag.endswith('}tr'):
                    texts.append('\n')
            full_txt = ''.join(texts)
            lines = [l.strip() for l in full_txt.split('\n') if l.strip()]
            pricing = [l for l in lines if any(k in l.lower() for k in ['inr', 'rs.', 'fee', 'professional', 'official', 'total'])]
            return pricing[:10]
    except Exception as e:
        return [f"Error: {e}"]

target_clients = ['Canara college', 'Codezyng & Zupaloop', 'Comparative QUOTES for RV', 'DSU', 'Lightspeed', 'Mantrika', 'PRS', 'SMVITM', 'Amrith noni -  Valyou products']

for folder in os.listdir(q_dir):
    folder_path = os.path.join(q_dir, folder)
    if not os.path.isdir(folder_path):
        continue
    # check if matches target or contains interesting files
    for root, dirs, files in os.walk(folder_path):
        for f in files:
            if f.endswith('.docx') and any(k in f.lower() for k in ['quote', 'quotation', 'cost', 'retainer', 'agreement']):
                full_p = os.path.join(root, f)
                print(f"\nClient / Folder: {folder} -> File: {f}")
                snippets = read_docx_snippet(full_p)
                for s in snippets[:6]:
                    clean = s.encode('ascii', 'backslashreplace').decode('ascii')
                    print("  ", clean)
