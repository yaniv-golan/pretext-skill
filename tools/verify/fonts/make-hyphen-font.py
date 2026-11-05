# Builds hyphen-u2010.woff2: the hyphen glyph of @fontsource/inter's latin 400 file, mapped to both
# U+002D and U+2010 (that file has no U+2010). fixtures.js draws InterWide's U+2010 from it.
# Run from tools/verify after `npm ci`, with fontTools and brotli: python3 fonts/make-hyphen-font.py
# Inter is under the SIL Open Font License 1.1 with no Reserved Font Name; the derived font is too
# (node_modules/@fontsource/inter/LICENSE) and is renamed so it is not mistaken for Inter.
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

font = TTFont('node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2')
options = Options()
options.layout_features = []
options.name_IDs = ['*']
subsetter = Subsetter(options)
subsetter.populate(unicodes=[0x2D])
subsetter.subset(font)
for table in font['cmap'].tables:
    if table.isUnicode():
        table.cmap[0x2010] = table.cmap[0x2D]
name = font['name']
for rec in list(name.names):
    if rec.nameID in (1, 3, 4, 6, 16, 17):
        name.removeNames(nameID=rec.nameID)
for nameID, value in ((1, 'Pretext Verify Hyphen'), (3, 'PretextVerifyHyphen-Regular'), (4, 'Pretext Verify Hyphen Regular'), (6, 'PretextVerifyHyphen-Regular')):
    name.setName(value, nameID, 3, 1, 0x409)
font.flavor = 'woff2'
font.save('fonts/hyphen-u2010.woff2')
