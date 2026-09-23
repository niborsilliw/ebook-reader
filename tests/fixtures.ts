import JSZip from "jszip";

// Builds small EPUBs in memory so tests don't depend on binary fixtures.

const xhtml = (title: string, body: string) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${title}</title><style>p { margin: 0 }</style></head>
<body>${body}</body></html>`;

const container = (opfPath: string) => `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

async function finish(zip: JSZip) {
  return zip.generateAsync({ type: "uint8array" });
}

/** EPUB 3: OPF in OEBPS/, chapters in OEBPS/Text/, nav in OEBPS/nav/, nested TOC, cover-image. */
export async function epub3() {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file("META-INF/container.xml", container("OEBPS/content.opf"));
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:1</dc:identifier>
    <dc:title>1984</dc:title>
    <dc:creator>George Orwell</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav/toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover" href="Images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>
    <item id="title" href="Text/title.xhtml" media-type="application/xhtml+xml"/>
    <item id="c1" href="Text/chapter%201.xhtml" media-type="application/xhtml+xml"/>
    <item id="c1b" href="Text/chapter1b.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="Text/chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="title"/><itemref idref="c1"/><itemref idref="c1b"/><itemref idref="c2"/>
  </spine>
</package>`,
  );
  zip.file(
    "OEBPS/nav/toc.xhtml",
    xhtml(
      "Contents",
      `<nav epub:type="landmarks"><ol><li><a href="../Text/title.xhtml">Start</a></li></ol></nav>
       <nav epub:type="toc"><h1>Contents</h1><ol>
         <li><a href="../Text/chapter%201.xhtml">Part One</a>
           <ol><li><a href="../Text/chapter%201.xhtml#s2">Section &amp; Two</a></li></ol>
         </li>
         <li><a href="../Text/chapter2.xhtml">Part Two</a></li>
       </ol></nav>`,
    ),
  );
  zip.file("OEBPS/Images/cover.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
  zip.file("OEBPS/Text/title.xhtml", xhtml("Title", `<h1>1984</h1>`));
  zip.file(
    "OEBPS/Text/chapter 1.xhtml",
    xhtml(
      "Part One",
      `<h1>Part One</h1>
       <p>It was a bright
          cold day in April, and the clocks were striking&#160;thirteen.</p>
       <script>alert("x")</script>
       <p id="s2">Winston Smith &amp; his chin<br/>nuzzled into his breast.</p>
       <table><tr><td>War</td><td>is</td><td>Peace</td></tr></table>`,
    ),
  );
  zip.file("OEBPS/Text/chapter1b.xhtml", xhtml("cont", `<p>Continuation of part one.</p>`));
  zip.file("OEBPS/Text/chapter2.xhtml", xhtml("Part Two", `<h1>Part Two</h1><p>Julia.</p>`));
  return finish(zip);
}

/** EPUB 2: OPF at root, NCX TOC, EPUB2-style cover meta. */
export async function epub2() {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file("META-INF/container.xml", container("content.opf"));
  zip.file(
    "content.opf",
    `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>Pride and Prejudice</dc:title>
    <dc:creator opf:role="aut">Jane Austen</dc:creator>
    <dc:language>en</dc:language>
    <meta name="cover" content="cov"/>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="cov" href="cover.png" media-type="image/png"/>
    <item id="c1" href="ch1.html" media-type="application/xhtml+xml"/>
    <item id="c2" href="ch2.html" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx"><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>`,
  );
  zip.file(
    "toc.ncx",
    `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="n1" playOrder="1"><navLabel><text>Chapter 1</text></navLabel><content src="ch1.html"/>
      <navPoint id="n1a" playOrder="2"><navLabel><text>Chapter 1, part 2</text></navLabel><content src="ch1.html#p2"/></navPoint>
    </navPoint>
    <navPoint id="n2" playOrder="3"><navLabel><text>Chapter 2</text></navLabel><content src="ch2.html"/></navPoint>
  </navMap>
</ncx>`,
  );
  zip.file("cover.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  zip.file("ch1.html", xhtml("c1", `<p>It is a truth universally acknowledged.</p>`));
  zip.file("ch2.html", xhtml("c2", `<p>Mr. Bennet was among the earliest.</p>`));
  return finish(zip);
}

/** Large synthetic book: `chapters` files of `wordsPerChapter` words in ~120-word paragraphs. */
export async function largeEpub(chapters: number, wordsPerChapter: number) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file("META-INF/container.xml", container("OPS/book.opf"));
  const items: string[] = [];
  const refs: string[] = [];
  const nav: string[] = [];
  const vocab = "the of and to in that was he it with as his for had on at by not be but from have which".split(" ");
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let c = 1; c <= chapters; c++) {
    const paras: string[] = [];
    for (let w = 0; w < wordsPerChapter; ) {
      const n = Math.min(120, wordsPerChapter - w);
      const words = Array.from({ length: n }, () => vocab[Math.floor(rand() * vocab.length)]);
      paras.push(`<p>${words.join(" ")}.</p>`);
      w += n;
    }
    zip.file(`OPS/c${c}.xhtml`, xhtml(`Chapter ${c}`, `<h2>Chapter ${c}</h2>${paras.join("\n")}`));
    items.push(`<item id="c${c}" href="c${c}.xhtml" media-type="application/xhtml+xml"/>`);
    refs.push(`<itemref idref="c${c}"/>`);
    nav.push(`<li><a href="c${c}.xhtml">Chapter ${c}</a></li>`);
  }
  zip.file("OPS/nav.xhtml", xhtml("nav", `<nav epub:type="toc"><ol>${nav.join("")}</ol></nav>`));
  zip.file(
    "OPS/book.opf",
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Big Book</dc:title></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${items.join("")}</manifest>
<spine>${refs.join("")}</spine></package>`,
  );
  return finish(zip);
}
