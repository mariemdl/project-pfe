#!/usr/bin/env python
"""
Multilingual Document Classifier Training Script
Run this ONCE to train and save the model
"""

import pickle
import numpy as np
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MultilingualDocumentClassifier:
    def __init__(self):
        self.vectorizer = None
        self.classifier = None
        self.labels = ['id_card', 'invoice', 'passport', 'contract']
        self.label_map = {label: i for i, label in enumerate(self.labels)}
    
    def create_synthetic_data(self, num_samples: int = 30):
        """Generate multilingual training data"""
        synthetic_data = []
        
        templates = {
            'id_card': {
                'en': [
                    "Identity Card Number: {num}. Name: {name}. Date of Birth: {dob}.",
                    "NATIONAL ID CARD\nID Number: {num}\nFull Name: {name}\nDOB: {dob}",
                ],
                'fr': [
                    "Carte d'Identité Nationale\nNuméro: {num}\nNom: {name}\nDate de Naissance: {dob}",
                    "N° CIN: {num}\nNom: {name}\nDate de naissance: {dob}",
                ],
                'ar': [
                    "بطاقة هوية\nرقم: {num}\nالاسم: {name}\nتاريخ الميلاد: {dob}",
                ],
                'de': [
                    "Personalausweis\nNummer: {num}\nName: {name}\nGeburtsdatum: {dob}",
                ],
                'es': [
                    "Cédula de Identidad\nNúmero: {num}\nNombre: {name}\nFecha de Nacimiento: {dob}",
                ],
                'it': [
                    "Carta d'Identità\nNumero: {num}\nNome: {name}\nData di Nascita: {dob}",
                ]
            },
            'invoice': {
                'en': [
                    "INVOICE\nNumber: {num}\nDate: {date}\nTotal: {amount}",
                    "Invoice #{num}\nDate: {date}\nAmount Due: {amount}",
                ],
                'fr': [
                    "FACTURE\nNuméro: {num}\nDate: {date}\nMontant Total: {amount}",
                ],
                'ar': [
                    "فاتورة\nرقم: {num}\nالتاريخ: {date}\nالمبلغ: {amount}",
                ],
                'de': [
                    "RECHNUNG\nNummer: {num}\nDatum: {date}\nBetrag: {amount}",
                ],
                'es': [
                    "FACTURA\nNúmero: {num}\nFecha: {date}\nTotal: {amount}",
                ],
                'it': [
                    "FATTURA\nNumero: {num}\nData: {date}\nTotale: {amount}",
                ]
            },
            'passport': {
                'en': [
                    "PASSPORT\nNumber: {num}\nName: {name}\nDOB: {dob}",
                    "Passport No: {num}\nHolder: {name}\nDate of Birth: {dob}",
                ],
                'fr': [
                    "PASSEPORT\nNuméro: {num}\nNom: {name}\nDate de Naissance: {dob}",
                ],
                'ar': [
                    "جواز سفر\nرقم: {num}\nالاسم: {name}\nتاريخ الميلاد: {dob}",
                ],
                'de': [
                    "REISEPASS\nNummer: {num}\nName: {name}\nGeburtsdatum: {dob}",
                ],
                'es': [
                    "PASAPORTE\nNúmero: {num}\nNombre: {name}\nFecha de Nacimiento: {dob}",
                ],
                'it': [
                    "PASSAPORTO\nNumero: {num}\nNome: {name}\nData di Nascita: {dob}",
                ]
            },
            'contract': {
                'en': [
                    "CONTRACT between {party1} and {party2}\nEffective Date: {date}",
                    "This Agreement is made on {date} by {party1} and {party2}",
                ],
                'fr': [
                    "CONTRAT entre {party1} et {party2}\nDate d'effet: {date}",
                ],
                'ar': [
                    "عقد بين {party1} و {party2}\nتاريخ السريان: {date}",
                ],
                'de': [
                    "VERTRAG zwischen {party1} und {party2}\nWirksamkeitsdatum: {date}",
                ],
                'es': [
                    "CONTRATO entre {party1} y {party2}\nFecha de Vigencia: {date}",
                ],
                'it': [
                    "CONTRATTO tra {party1} e {party2}\nData di efficacia: {date}",
                ]
            }
        }
        
        for doc_type, lang_templates in templates.items():
            for lang, template_list in lang_templates.items():
                for i in range(num_samples):
                    for template in template_list:
                        text = template.format(
                            num=f"{np.random.randint(100000, 999999)}",
                            name=f"Sample Name {i}",
                            dob=f"{np.random.randint(1, 31)}/{np.random.randint(1, 13)}/{np.random.randint(1970, 2005)}",
                            date=f"{np.random.randint(1, 28)}/{np.random.randint(1, 13)}/2024",
                            amount=f"{np.random.randint(100, 10000)}.00",
                            party1=f"Party A{i}",
                            party2=f"Party B{i}"
                        )
                        synthetic_data.append((text, doc_type))
        
        return synthetic_data
    
    def train(self):
        """Train the classifier"""
        logger.info("Generating synthetic training data...")
        synthetic_data = self.create_synthetic_data(num_samples=30)
        texts = [item[0] for item in synthetic_data]
        labels = [item[1] for item in synthetic_data]
        
        logger.info(f"Total training samples: {len(texts)}")
        
        # Create TF-IDF vectors (character-based for multilingual)
        self.vectorizer = TfidfVectorizer(
            analyzer='char_wb',
            ngram_range=(2, 5),
            max_features=5000,
            sublinear_tf=True
        )
        
        X = self.vectorizer.fit_transform(texts)
        y = [self.label_map[label] for label in labels]
        
        # Train Random Forest
        self.classifier = RandomForestClassifier(
            n_estimators=100,
            max_depth=20,
            random_state=42,
            n_jobs=-1
        )
        
        # Cross-validation
        cv_scores = cross_val_score(self.classifier, X, y, cv=5)
        logger.info(f"Cross-validation scores: {cv_scores}")
        logger.info(f"Mean CV accuracy: {cv_scores.mean():.4f}")
        
        # Train final model
        self.classifier.fit(X, y)
        
        # Save model
        self.save_model()
        
        return cv_scores.mean()
    
    def save_model(self, model_path: str = "/app/models/document_classifier.pkl"):
        """Save the trained model"""
        Path(model_path).parent.mkdir(parents=True, exist_ok=True)
        with open(model_path, 'wb') as f:
            pickle.dump((self.vectorizer, self.classifier, self.labels), f)
        logger.info(f"Model saved to {model_path}")


if __name__ == "__main__":
    classifier = MultilingualDocumentClassifier()
    accuracy = classifier.train()
    logger.info(f"Training complete! Accuracy: {accuracy:.4f}")