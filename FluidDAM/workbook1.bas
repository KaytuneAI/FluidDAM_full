Private Sub Workbook_Open()
    On Error Resume Next
    Application.CommandBars("Quick Access Toolbar").Controls("Fluid布局导出").Delete
    On Error GoTo 0
    
    Application.CommandBars("Quick Access Toolbar").Controls.Add(Type:=msoControlButton).Caption = "Fluid布局导出"
    Application.CommandBars("Quick Access Toolbar").Controls("Fluid布局导出").OnAction = "ExportLayoutWin"
End Sub