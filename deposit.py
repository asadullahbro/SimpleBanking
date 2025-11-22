import customtkinter as ctk
import json
def deposit_gui():
    window = ctk.CTkToplevel()
    window.geometry("400x300")
    window.title("Deposit money")
    feedback_label = ctk.CTkLabel(window, text="")
    feedback_label.pack(pady=10)
    name_entry = ctk.CTkEntry(window, placeholder_text="Enter Name")
    name_entry.pack(pady=10)
    balance_entry = ctk.CTkEntry(window, placeholder_text="Enter Amount")
    balance_entry.pack(pady=10)

    def deposit_money():
        try:
            with open("accounts.json", "r") as file:
                accounts = json.load(file)
        except FileNotFoundError:
            accounts = {}
        name = name_entry.get()
        deposit_amount = balance_entry.get()
        try:
            deposit_amount = float(deposit_amount)
        except ValueError:
            feedback_label.configure(text="Please enter a numeric value")
            return
        if deposit_amount < 0:
            feedback_label.configure(text="Deposit must be positive")

        if name in accounts:
            accounts[name] += deposit_amount
            feedback_label.configure(text=f"Deposited {deposit_amount}!")
            with open("accounts.json", "w") as file:
                json.dump(accounts, file, indent=4)

        else:
            feedback_label.configure(text="Account does not exist!")
    deposit_money_btn = ctk.CTkButton(window, text="Deposit money", command=deposit_money)
    deposit_money_btn.pack(pady=10)
