import zipfile
import xml.etree.ElementTree as ET

def get_docx_tables(path):
    with zipfile.ZipFile(path) as z:
        xml_content = z.read('word/document.xml')
        tree = ET.fromstring(xml_content)
        tables = []
        for t_elem in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tbl'):
            table_rows = []
            for r_elem in t_elem.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tr'):
                row_cells = []
                for c_elem in r_elem.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tc'):
                    texts = [t.text for t in c_elem.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if t.text]
                    row_cells.append(' '.join(texts).strip())
                if row_cells:
                    table_rows.append(row_cells)
            if table_rows:
                tables.append(table_rows)
        return tables

orig_path = r'Lextria Finance Dashboard\Quotations\MAHE\Agreement orginal - TTO & An Astraea Innovative Solutions.docx'
addendum4_path = r'Lextria Finance Dashboard\Quotations\MAHE\Adendum_4_-_TTO_&_An_Astraea_Innovative_Solutions_.docx'

print("=== ORIGINAL AGREEMENT TABLES ===")
for i, t in enumerate(get_docx_tables(orig_path)):
    print(f"\n--- Table {i} ---")
    for r in t:
        print(" | ".join(r))

print("\n=== ADDENDUM 4 TABLES ===")
for i, t in enumerate(get_docx_tables(addendum4_path)):
    print(f"\n--- Table {i} ---")
    for r in t:
        print(" | ".join(r))
