import customtkinter as ctk
from createAccount import open_create_account
from check_balance import check_balance
from deposit import deposit_gui
from withdraw import withdraw_gui
app = ctk.CTk()
app.geometry("400x400")
app.title("Simple Banking")

frame = ctk.CTkFrame(app)
frame.pack(pady=20, padx=20)

create_account_btn = ctk.CTkButton(frame, text="Create Account", command=open_create_account)
create_account_btn.grid(row=0, column=0, pady=10)

check_balance_btn = ctk.CTkButton(frame, text="Check balance", command=check_balance)
check_balance_btn.grid(row=1, column=0, pady=10)

deposit_money_btn = ctk.CTkButton(frame, text="Deposit money", command=deposit_gui)
deposit_money_btn.grid(row=2, column=0, pady=10)

withdraw_money_btn = ctk.CTkButton(frame, text="Withdraw money", command=withdraw_gui)
withdraw_money_btn.grid(row=3, column=0, pady=10)


app.mainloop()
