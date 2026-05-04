import asyncio
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import Table, TableStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import aiofiles
from typing import List, Dict, Any
import logging
import os

logger = logging.getLogger(__name__)

# Register Arabic-capable font for Docker/Linux
HAS_ARABIC_FONT = False
ARABIC_FONT_NAME = 'Helvetica'  # Fallback

# Try Docker/Linux fonts that support Arabic
font_paths = ["/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]

for font_path in font_paths:
    if os.path.exists(font_path):
        try:
            pdfmetrics.registerFont(TTFont('ArabicFont', font_path))
            HAS_ARABIC_FONT = True
            ARABIC_FONT_NAME = 'ArabicFont'
            logger.info(f"✅ Using font for Arabic text: {font_path}")
            break
        except Exception as e:
            logger.warning(f"Failed to load {font_path}: {e}")

if not HAS_ARABIC_FONT:
    logger.warning("⚠️ No Arabic font found. Arabic text may show as symbols in PDFs.")

async def generate_pdf(batch_id: int, doc_type: str, cards_data: List[Dict], output_path: str):
    """Generate PDF report for extracted data"""
    
    def _generate():
        c = canvas.Canvas(str(output_path), pagesize=A4)
        width, height = A4
        y = height - inch
        
        # Title
        c.setFont(ARABIC_FONT_NAME if HAS_ARABIC_FONT else "Helvetica-Bold", 16)
        c.drawString(inch, y, f"Document Extraction Report - Batch #{batch_id}")
        y -= 0.3 * inch
        
        c.setFont(ARABIC_FONT_NAME if HAS_ARABIC_FONT else "Helvetica", 12)
        c.drawString(inch, y, f"Document Type: {doc_type.replace('-', ' ').title()}")
        y -= 0.3 * inch
        c.drawString(inch, y, f"Date: {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')}")
        y -= 0.5 * inch
        
        for card in cards_data:
            if y < 2 * inch:
                c.showPage()
                y = height - inch
            
            # Card title
            c.setFont(ARABIC_FONT_NAME if HAS_ARABIC_FONT else "Helvetica-Bold", 14)
            c.drawString(inch, y, f"Document #{card['index'] + 1}")
            y -= 0.3 * inch
            
            # Original fields
            c.setFont(ARABIC_FONT_NAME if HAS_ARABIC_FONT else "Helvetica-Bold", 12)
            c.drawString(inch, y, "Extracted Data:")
            y -= 0.2 * inch
            
            data = [["Field", "Value", "Confidence"]]
            for field in card['fields']:
                # Format field name for display
                field_name = field['name'].replace('_', ' ').title()
                field_value = field['value']
                
                data.append([
                    field_name,
                    field_value,
                    f"{field['confidence']*100:.0f}%"
                ])
            
            table = Table(data, colWidths=[2*inch, 3*inch, 1*inch])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), ARABIC_FONT_NAME if HAS_ARABIC_FONT else 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            
            table.wrapOn(c, width, height)
            table.drawOn(c, inch, y - len(data)*0.2*inch)
            y -= len(data) * 0.2 * inch + 0.3 * inch
            
            # Translated fields if present
            if card.get('translated_fields') and card['translated_fields']:
                c.setFont(ARABIC_FONT_NAME if HAS_ARABIC_FONT else "Helvetica-Bold", 12)
                c.drawString(inch, y, "Translated Data:")
                y -= 0.2 * inch
                
                trans_data = [["Field", "Value"]]
                for field in card['translated_fields']:
                    field_name = field['name'].replace('_', ' ').title()
                    trans_data.append([field_name, field['value']])
                
                trans_table = Table(trans_data, colWidths=[2*inch, 4*inch])
                trans_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('FONTNAME', (0, 0), (-1, 0), ARABIC_FONT_NAME if HAS_ARABIC_FONT else 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 10),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                    ('BACKGROUND', (0, 1), (-1, -1), colors.lightcyan),
                    ('GRID', (0, 0), (-1, -1), 1, colors.black)
                ]))
                
                trans_table.wrapOn(c, width, height)
                trans_table.drawOn(c, inch, y - len(trans_data)*0.2*inch)
                y -= len(trans_data) * 0.2 * inch + 0.5 * inch
            else:
                y -= 0.2 * inch
        
        c.save()
        logger.info(f"PDF generated: {output_path}")
    
    # Run in thread pool to avoid blocking
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _generate)