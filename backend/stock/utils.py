from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from io import BytesIO
import os
from django.conf import settings
from django.core.mail import EmailMessage
from django.template.loader import render_to_string
from datetime import datetime
from xml.sax.saxutils import escape
import logging

logger = logging.getLogger(__name__)

def generate_commande_pdf(commande):
    """
    Génère un PDF pour une commande fournisseur
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    
    # Styles personnalisés
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=20,
        spaceAfter=30,
        alignment=1,  # Centré
        textColor=colors.darkblue
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        spaceAfter=12,
        textColor=colors.black
    )
    
    # Contenu du PDF
    story = []
    
    # En-tête
    story.append(Paragraph(escape(commande.organisation.nom), heading_style))
    story.append(Paragraph("BON DE COMMANDE", title_style))
    story.append(Spacer(1, 20))
    
    # Informations de la commande
    story.append(Paragraph(f"Numéro: {commande.numero}", heading_style))
    story.append(Paragraph(f"Date: {commande.created_at.strftime('%d/%m/%Y')}", styles['Normal']))
    story.append(Paragraph(f"Statut: {commande.get_statut_display()}", styles['Normal']))
    story.append(Spacer(1, 20))
    
    # Informations du fournisseur
    story.append(Paragraph("FOURNISSEUR", heading_style))
    story.append(Paragraph(f"Nom: {escape(commande.fournisseur.nom)}", styles['Normal']))
    if commande.fournisseur.email:
        story.append(Paragraph(f"Email: {commande.fournisseur.email}", styles['Normal']))
    if commande.fournisseur.telephone:
        story.append(Paragraph(f"Téléphone: {commande.fournisseur.telephone}", styles['Normal']))
    story.append(Spacer(1, 20))
    
    # Tableau des produits
    story.append(Paragraph("PRODUITS COMMANDÉS", heading_style))
    
    # Préparation des données pour le tableau
    data = [["Produit", "Quantité", "Prix unitaire", "Total"]]
    for ligne in commande.lignes.all():
        data.append([
            ligne.produit.nom,
            str(ligne.quantite),
            f"{ligne.prix_unitaire:.2f} {commande.devise}",
            f"{ligne.montant_total:.2f} {commande.devise}"
        ])
    
    # Création du tableau
    table = Table(data, colWidths=[3*inch, 1*inch, 1.2*inch, 1.2*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    
    story.append(table)
    story.append(Spacer(1, 20))
    
    # Total
    story.append(Paragraph(f"TOTAL: {commande.montant_total:.2f} {commande.devise}", heading_style))
    
    # Notes si présentes
    if commande.notes:
        story.append(Spacer(1, 20))
        story.append(Paragraph("NOTES", heading_style))
        story.append(Paragraph(escape(commande.notes), styles['Normal']))
    
    # Pied de page
    story.append(Spacer(2, 30))
    story.append(Paragraph("Merci pour votre confiance!", styles['Normal']))
    story.append(Paragraph(f"Généré le {datetime.now().strftime('%d/%m/%Y %H:%M')}", styles['Normal']))
    
    # Génération du PDF
    doc.build(story)
    buffer.seek(0)
    
    return buffer.getvalue()

def envoyer_commande_email(commande):
    """
    Envoie un email au fournisseur avec le PDF de la commande en pièce jointe
    """
    if not commande.fournisseur.email:
        return False
    try:
        # Génération du PDF
        pdf_content = generate_commande_pdf(commande)
        
        # Sujet de l'email
        subject = f"Nouvelle commande - {commande.numero}"
        
        # Contenu de l'email
        email_body = f"""
Bonjour {commande.fournisseur.nom},

Nous avons le plaisir de vous informer qu'une nouvelle commande a été passée :

Numéro de commande : {commande.numero}
Date : {commande.created_at.strftime('%d/%m/%Y')}
Montant total : {commande.montant_total:.2f} {commande.devise}

Vous trouverez en pièce jointe le bon de commande détaillé.

Nous vous remercions de votre confiance et restons à votre disposition pour toute question.

Cordialement,
Service Achats
{commande.organisation.nom}
"""
        
        # Création de l'email
        email = EmailMessage(
            subject=subject,
            body=email_body,
            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@dutyfree.com'),
            to=[commande.fournisseur.email],
            reply_to=[commande.organisation.email] if commande.organisation.email else None,
        )
        
        # Ajout de la pièce jointe PDF
        email.attach(
            f"commande_{commande.numero}.pdf",
            pdf_content,
            'application/pdf'
        )
        
        # Envoi de l'email
        email.send()
        
        return True
    except Exception:
        logger.exception("Erreur envoi email commande %s", commande.numero)
        return False
