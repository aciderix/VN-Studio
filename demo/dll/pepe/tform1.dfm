object Form1: TForm1
  Left = 325
  Top = 274
  ActiveControl = maskEdit
  Align = alTop
  BorderStyle = bsNone
  ClientHeight = 400
  ClientWidth = 640
  Color = clSilver
  Font.Charset = DEFAULT_CHARSET
  Font.Color = clWindowText
  Font.Height = 245
  Font.Name = 'MS Sans Serif'
  Font.Style = []
  OldCreateOrder = True
  OnCreate = FormCreate
  OnMouseMove = FormMouseMove
  OnShow = FormShow
  PixelsPerInch = 96
  TextHeight = 13
  object imgBkgnd: TImage
    Left = 0
    Top = 0
    Width = 640
    Height = 400
    AutoSize = True
    Picture.Data = {257090 bytes}
    OnMouseMove = FormMouseMove
  end
  object lblComment: TLabel
    Left = 376
    Top = 344
    Width = 169
    Height = 57
    Alignment = taCenter
    AutoSize = False
    Font.Charset = ANSI_CHARSET
    Font.Color = clBlack
    Font.Height = 237
    Font.Name = 'Comic Sans MS'
    Font.Style = []
    ParentFont = False
    Transparent = True
    WordWrap = True
  end
  object Label3: TLabel
    Left = 400
    Top = 88
    Width = 161
    Height = 26
    Caption = 'Combien y a t-il de'
    Font.Charset = ANSI_CHARSET
    Font.Color = clWindowText
    Font.Height = 237
    Font.Name = 'Comic Sans MS'
    Font.Style = []
    ParentFont = False
    Transparent = True
  end
  object Label4: TLabel
    Left = 376
    Top = 120
    Width = 186
    Height = 26
    Caption = 'marches pour monter'
    Font.Charset = ANSI_CHARSET
    Font.Color = clWindowText
    Font.Height = 237
    Font.Name = 'Comic Sans MS'
    Font.Style = []
    ParentFont = False
    Transparent = True
  end
  object Label5: TLabel
    Left = 376
    Top = 152
    Width = 197
    Height = 26
    Caption = 'au dernier étage de la '
    Font.Charset = ANSI_CHARSET
    Font.Color = clWindowText
    Font.Height = 237
    Font.Name = 'Comic Sans MS'
    Font.Style = []
    ParentFont = False
    Transparent = True
  end
  object Label6: TLabel
    Left = 416
    Top = 184
    Width = 110
    Height = 26
    Caption = 'tour Eiffel ?'
    Font.Charset = ANSI_CHARSET
    Font.Color = clWindowText
    Font.Height = 237
    Font.Name = 'Comic Sans MS'
    Font.Style = []
    ParentFont = False
    Transparent = True
  end
  object Label1: TLabel
    Left = 424
    Top = 224
    Width = 47
    Height = 26
    Caption = 'Il y a'
    Font.Charset = ANSI_CHARSET
    Font.Color = clWindowText
    Font.Height = 237
    Font.Name = 'Comic Sans MS'
    Font.Style = []
    ParentFont = False
    Transparent = True
  end
  object Label2: TLabel
    Left = 456
    Top = 256
    Width = 73
    Height = 26
    Caption = 'marches'
    Font.Charset = ANSI_CHARSET
    Font.Color = clWindowText
    Font.Height = 237
    Font.Name = 'Comic Sans MS'
    Font.Style = []
    ParentFont = False
    Transparent = True
  end
  object lblQuit: TLabel
    Left = 84
    Top = 360
    Width = 70
    Height = 27
    Caption = 'Quitter'
    Font.Charset = ANSI_CHARSET
    Font.Color = clWhite
    Font.Height = 237
    Font.Name = 'Comic Sans MS'
    Font.Style = [fsBold]
    ParentFont = False
    Transparent = True
    Visible = False
    OnMouseMove = FormMouseMove
  end
  object btnQuit: TLabel
    Left = 8
    Top = 296
    Width = 73
    Height = 97
    AutoSize = False
    Transparent = True
    OnClick = btnQuitClick
    OnMouseMove = FormMouseMove
  end
  object maskEdit: TVNMaskEdit
    Left = 488
    Top = 224
    Width = 49
    Height = 23
    BorderStyle = bsNone
    Color = clWhite
    EditMask = '0000;0;*'
    Font.Charset = ANSI_CHARSET
    Font.Color = clBlue
    Font.Height = 237
    Font.Name = 'Comic Sans MS'
    Font.Style = []
    MaxLength = 4
    ParentFont = False
    TabOrder = 0
    OnChange = maskE
  end
end