#!/usr/bin/env python3
"""
WhatsApp Chat Anonymizer
Anonymizes Android WhatsApp exports by:
- Replacing contact names with consistent Person_N identifiers
- Replacing phone numbers with x's
- Preserving timestamps, media references, and message content
"""

import re
import sys
from pathlib import Path
from typing import Dict, Tuple


class WhatsAppAnonymizer:
    # Android WhatsApp format: DD/MM/YYYY, HH:MM - Contact Name: Message
    MESSAGE_PATTERN = re.compile(
        r'^(\d{1,2}/\d{1,2}/\d{4},\s+\d{1,2}:\d{2})\s+-\s+(.+?):\s+(.*)$'
    )
    
    # Phone number patterns (international, with/without spaces, dashes, etc.)
    PHONE_PATTERNS = [
        r'\+\d{1,3}\s?[-.\s]?\d{1,14}(?:\s?[-.\s]?\d{1,14})*',  # +1 234 567 8900
        r'\(\d{1,4}\)\s?\d{1,4}[-.\s]?\d{1,4}',                  # (123) 456-7890
        r'\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b',                     # 123-456-7890
        r'\b\d{10,14}\b',                                          # 1234567890
    ]

    def __init__(self):
        self.name_mapping: Dict[str, str] = {}
        self.counter = 0

    def anonymize_name(self, original_name: str) -> str:
        """
        Returns a consistent anonymized name for a contact.
        Same input always returns same output.
        """
        # Strip whitespace and handle edge cases
        normalized = original_name.strip()
        
        if not normalized:
            return "Unknown"
        
        if normalized in self.name_mapping:
            return self.name_mapping[normalized]
        
        # Create new anonymized name
        self.counter += 1
        anon_name = f"Person_{self.counter}"
        self.name_mapping[normalized] = anon_name
        return anon_name

    def anonymize_phone_numbers(self, text: str) -> str:
        """Replace phone numbers with x's (matching length)."""
        for pattern in self.PHONE_PATTERNS:
            def replacer(match):
                phone = match.group(0)
                # Keep formatting, replace digits with x
                return re.sub(r'\d', 'x', phone)
            
            text = re.sub(pattern, replacer, text)
        
        return text

    def process_line(self, line: str) -> str:
        """
        Process a single line from the chat.
        Returns anonymized line, or original if not a message.
        """
        line = line.rstrip('\n')
        
        # Try to match standard message format
        match = self.MESSAGE_PATTERN.match(line)
        
        if match:
            timestamp = match.group(1)
            contact_name = match.group(2)
            message = match.group(3)
            
            # Anonymize contact name
            anon_name = self.anonymize_name(contact_name)
            
            # Anonymize phone numbers in message
            anon_message = self.anonymize_phone_numbers(message)
            
            return f"{timestamp} - {anon_name}: {anon_message}"
        
        # If no match, it might be a continuation line (multi-line message)
        # or a system message. Just anonymize phone numbers in it.
        return self.anonymize_phone_numbers(line)

    def process_file(self, input_path: str, output_path: str) -> None:
        """
        Read input chat file, anonymize it, write to output file.
        """
        try:
            with open(input_path, 'r', encoding='utf-8') as infile:
                lines = infile.readlines()
        except FileNotFoundError:
            print(f"Error: File '{input_path}' not found.")
            sys.exit(1)
        except UnicodeDecodeError:
            print(f"Error: Could not read file with UTF-8 encoding.")
            sys.exit(1)

        anonymized_lines = [self.process_line(line) for line in lines]

        with open(output_path, 'w', encoding='utf-8') as outfile:
            outfile.writelines([line + '\n' if not line.endswith('\n') else line 
                               for line in anonymized_lines])

        print(f"✓ Anonymization complete!")
        print(f"  Input:  {input_path}")
        print(f"  Output: {output_path}")
        print(f"  Anonymized {len(self.name_mapping)} unique contacts")
        print(f"\nName mappings:")
        for original, anon in sorted(self.name_mapping.items()):
            print(f"  {original} → {anon}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python whatsapp_anonymizer.py <input_file> [output_file]")
        print()
        print("Example:")
        print("  python whatsapp_anonymizer.py chat.txt chat_anonymized.txt")
        print()
        print("If output file is not specified, '_anonymized' suffix is added to input filename.")
        sys.exit(1)

    input_file = sys.argv[1]
    
    # Determine output file
    if len(sys.argv) >= 3:
        output_file = sys.argv[2]
    else:
        path = Path(input_file)
        output_file = path.parent / f"{path.stem}_anonymized{path.suffix}"

    anonymizer = WhatsAppAnonymizer()
    anonymizer.process_file(input_file, str(output_file))


if __name__ == "__main__":
    main()