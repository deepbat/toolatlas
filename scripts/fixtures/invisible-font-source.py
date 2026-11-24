# Regenerate the embedded blank font in unicodeLayer.ts with fonttools>=4.
# All glyphs have empty outlines. The advancing glyph is1000 units and mark glyph0.
# This file is a source recipe, not a runtime dependency.
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
f=FontBuilder(1000,isTTF=True)
names=['.notdef','g1','g2']
f.setupGlyphOrder(names)
f.setupCharacterMap({65:'g1',769:'g2'})
f.setupGlyf({n:TTGlyphPen(None).glyph() for n in names})
f.setupHorizontalMetrics({'.notdef':(1000,0),'g1':(1000,0),'g2':(0,0)})
f.setupHorizontalHeader(ascent=800,descent=-200)
f.setupNameTable({'familyName':'DeepakInvisible','styleName':'Regular','uniqueFontIdentifier':'DeepakInvisible','fullName':'DeepakInvisible','psName':'DeepakInvisible'})
f.setupOS2(sTypoAscender=800,sTypoDescender=-200,usWinAscent=800,usWinDescent=200)
f.setupPost();f.setupMaxp()
f.font['head'].created=f.font['head'].modified=2082844800
f.save('invisible.ttf')
